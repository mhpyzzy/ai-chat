import { deepseek } from "@ai-sdk/deepseek";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from "ai";
import path from "node:path";
import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/tools";

/**
 * MCP 对话 API —— 用 MCP Client 连接 MCP Server，把 Server 暴露的工具注入对话。
 *
 * 这是 MCP 的消费端（Client 侧）。与 /api/chat 的区别：
 *   - /api/chat    ：工具定义在本地代码（src/lib/tools），进程内调用
 *   - /api/mcp-chat：工具来自远程 MCP Server（独立进程），通过协议发现和调用
 *
 * 为什么值得单独做：
 *   1. 工具定义解耦：Server 换了工具，Client 不用改代码（重新发现即可）
 *   2. 标准化：同一个 Server 能被 Claude Desktop、Cursor 等任何 MCP Client 消费
 *   3. 面试核心：能讲清楚 Client → Transport → Server → Tool 的完整链路
 *
 * 生命周期：每次请求创建 Client → 连接 → 获取工具 → 对话 → 关闭。
 * （生产环境应复用连接，这里每次新建是为了演示清晰。）
 */

export const maxDuration = 60;

const SYSTEM_PROMPT = [
  "你是一个通过 MCP 协议连接知识库的智能助手。",
  "你的工具来自一个独立的 MCP Server，不是本地代码。",
  "",
  "工具使用原则：",
  "- 需要查阅公司资料时，调用 search_docs 搜索知识库",
  "- 想了解知识库有什么内容时，调用 list_documents",
  // "- 闲聊和通用常识不要调用工具",
  "- 不能闲聊，只能回答与知识库相关的问题, 如果用户问了与知识库无关的问题，请礼貌告知「我只能回答与知识库相关的问题哦」",
  "- 拿到工具结果后，用简洁友好的中文总结",
  "",
  "回答规范：基于检索到的上下文回答，末尾标注来源，信息不足时如实告知。",
].join("\n");

export async function POST(req: Request) {
  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages as ChatMessage[];
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON" },
      { status: 400 },
    );
  }

  try {
    // UI 消息 → 模型消息（剥离 UI 元数据，只留 role + content）
    const modelMessages = await convertToModelMessages(messages);

    // MCP Server 脚本路径（相对于项目根目录）
    const serverPath = path.join(process.cwd(), "src", "mcp", "server.ts");

    // 创建 MCP Client，用 stdio 传输连接 Server 进程
    // 用 node --import tsx：node 在 PATH 里最可靠，tsx 作为 ESM loader 转译 TypeScript
    const transport = new Experimental_StdioMCPTransport({
      command: "node",
      args: ["--import", "tsx", serverPath],
      cwd: process.cwd(),
      // 子进程需要 embedding 的 API Key（百炼）
      env: {
        ...process.env,
        DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY ?? "",
      },
      stderr: "pipe",
    });

    const mcpClient = await createMCPClient({ transport });

    // 发现 MCP Server 暴露的所有工具，转成 AI SDK 的 tool 格式
    const mcpTools = await mcpClient.tools();

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model: deepseek("deepseek-chat"),
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          // MCP 工具和本地工具的用法完全一样 —— 这就是标准化的价值
          tools: mcpTools,
          stopWhen: stepCountIs(5),
        });

        writer.merge(result.toUIMessageStream());
      },
      // 对话流完全结束后关闭 MCP 连接（onFinish 在所有 chunk flush 后触发）
      onFinish: () => mcpClient.close(),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    console.error("[mcp-chat] 失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "MCP 对话失败" },
      { status: 500 },
    );
  }
}

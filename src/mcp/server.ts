#!/usr/bin/env tsx
/**
 * MCP Server —— 知识库服务的标准化能力暴露层。
 *
 * 这是独立进程，通过 stdio（标准输入输出）与 MCP Client 通信。
 * Client（@ai-sdk/mcp 的 createMCPClient）用 StdioMCPTransport 连接本文件。
 *
 * 为什么用独立进程而不是 Next.js Route Handler：
 *   MCP 的核心价值是标准化——一个 Server 可以被任何 MCP Client 消费
 *   （Claude Desktop、Cursor、你自己的 App）。独立进程让它与宿主解耦。
 *
 * 运行方式：npx tsx src/mcp/server.ts
 * （不能用 node 直接跑 .ts；tsx 负责即时转译，并解析 tsconfig 的 @/ 别名）
 *
 * 三个原语（MCP 规范核心，面试必问）：
 *   1. Tool    —— Agent 主动调用的函数（搜索知识库、列出文档）
 *   2. Resource —— 被动暴露的可读数据（文档清单，用 URI 标识）
 *   3. Prompt   —— 可复用的提示词模板（总结某话题的预制 prompt）
 *
 * 三者协作关系：
 *   Client 连接 → 发现 Server 暴露的能力 → Agent 按需调用 Tool / 读取 Resource / 获取 Prompt
 *   Tool = 动作，Resource = 数据，Prompt = 模板。各司其职。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatContextWithSources, retrieve } from "@/lib/rag";
import { countChunks, listDocuments } from "@/lib/vector-store";

const server = new McpServer({
  name: "kb-mcp-server",
  version: "1.0.0",
});

// ============ 原语 1: Tool（Agent 主动调用） ============

// Tool: search_docs — 搜索知识库，返回最相关的文档片段。
// Agent 看到用户问知识库相关问题时主动调用。
// inputSchema 用 Zod：MCP SDK 转 JSON Schema 发给 Client，Client 再转成 AI SDK tool 定义。
server.registerTool(
  "search_docs",
  {
    title: "搜索知识库",
    description: "搜索知识库，返回与查询最相关的文档片段。当用户询问产品文档、FAQ、政策、业务规则等需要查阅资料的问题时调用。对闲聊和通用常识不要调用。",
    inputSchema: {
      query: z.string().describe("搜索查询词，聚焦于用户想了解的具体信息"),
      topK: z.number().int().min(1).max(10).optional().describe("返回结果数量，默认 4"),
    },
  },
  async ({ query, topK }) => {
    const results = await retrieve(query, topK ?? 4);
    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: `未找到与「${query}」相关的内容。` }] };
    }
    const context = formatContextWithSources(results);
    return { content: [{ type: "text" as const, text: context }] };
  },
);

// Tool: list_documents — 列出知识库所有文档（零参数工具）。
// Agent 用它了解"知识库里有哪些资料"，再决定是否深入搜索。
server.registerTool(
  "list_documents",
  {
    title: "列出知识库文档",
    description: "列出知识库中所有已上传的文档及其分块数量。当用户想知道知识库内容概况、确认是否有某类资料时调用。",
    inputSchema: {},
  },
  async () => {
    const docs = await listDocuments();
    const total = await countChunks();
    const summary = docs.length === 0
      ? "知识库为空，请先上传文档。"
      : docs.map((d) => `- 《${d.title}》（${d.chunkCount} 个片段）`).join("\n");
    return { content: [{ type: "text" as const, text: `知识库共 ${docs.length} 份文档，${total} 个片段：\n${summary}` }] };
  },
);

// ============ 原语 2: Resource（被动暴露的可读数据） ============

// Resource: kb://documents — 用 URI 标识的只读数据。Client 按 URI 读取。
// 与 Tool 的区别：Tool 是"执行动作"，Resource 是"提供数据"。适合静态信息。
server.registerResource(
  "documents",
  "kb://documents",
  {
    title: "知识库文档清单",
    description: "知识库中所有文档的标题和分块数量",
    mimeType: "application/json",
  },
  async () => {
    const docs = await listDocuments();
    return {
      contents: [
        { uri: "kb://documents", mimeType: "application/json", text: JSON.stringify(docs, null, 2) },
      ],
    };
  },
);

// ============ 原语 3: Prompt（可复用的提示词模板） ============

// Prompt: summarize_topic — 预制提示词模板，带参数。Client 传参后返回拼好的 messages。
// 与 Tool 的区别：Tool 执行后端逻辑返回数据，Prompt 返回给模型的指令。
server.registerPrompt(
  "summarize_topic",
  {
    title: "话题总结模板",
    description: "生成一个用于总结指定话题的提示词。会先搜索知识库补充背景，再组织总结指令。",
    argsSchema: {
      topic: z.string().describe("要总结的话题，例如「退换货政策」「配送时效」"),
    },
  },
  async ({ topic }) => {
    const results = await retrieve(topic, 3);
    const reference = results.length > 0 ? formatContextWithSources(results) : "（知识库中暂无相关内容）";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `请总结以下话题：${topic}\n\n【参考资料】\n${reference}\n\n要求：基于参考资料总结，标注来源，300 字以内。`,
          },
        },
      ],
    };
  },
);

// ============ 启动 ============

// StdioServerTransport：通过 stdin/stdout 收发 JSON-RPC。stdout 是协议通道，日志只能写 stderr。
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[kb-mcp-server] 已启动，等待 Client 连接...");
}

main().catch((err) => {
  console.error("[kb-mcp-server] 启动失败:", err);
  process.exit(1);
});

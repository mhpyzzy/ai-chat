import { deepseek } from "@ai-sdk/deepseek";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from "ai";
import { tools, type ChatMessage } from "@/lib/tools";
import { manageMemory, type MemoryDiagnostic } from "@/lib/memory";

// streaming 最长允许 30 秒（Vercel Serverless 函数上限）
export const maxDuration = 30;

const SYSTEM_PROMPT = [
  "你是一个实用的企业知识库助手，具备以下能力：",
  "1. 查询天气、做数学计算、查看时间（通用工具）",
  "2. 检索内部知识库（产品文档、FAQ、政策、手册等）",
  "",
  "工具使用原则：",
  "- 需要查阅公司资料、产品细节、业务规则才能回答的问题，必须先调用 searchKnowledgeBase 检索，不要凭空编造",
  "- 闲聊、通用常识、计算、天气等不需要查知识库的问题，不要调用知识库工具",
  "- 拿到工具结果后，用简洁友好的中文总结，不要原样吐 JSON",
  "",
  "知识库回答规范（RAG 关键）：",
  "- 只基于检索到的上下文回答，严禁使用上下文之外的信息",
  "- 上下文不足或为空时，如实告知用户「知识库中暂无相关内容」，不要猜测",
  "- 回答末尾标注信息来源，格式如：参考资料：《文档标题》（让回答可追溯，这是 RAG 区别于普通聊天的核心价值）",
].join("\n");

export async function POST(req: Request) {
  const { messages }: { messages: ChatMessage[] } = await req.json();

  // 记忆管理：短期裁剪（剥离旧工具结果省 token）+ 长期摘要（超长对话压缩成摘要）
  // 详见 src/lib/memory.ts。这是 Agent Memory 的核心：让模型在长对话中保持记忆，
  // 同时控制 token 用量和上下文窗口。
  const { modelMessages, summarized, originalCount, finalCount } =
    await manageMemory(messages);
  if (summarized) {
    console.log("[chat] 已触发长期记忆摘要，压缩了早期对话");
  }

  // 用 createUIMessageStream 包裹：先发一个记忆诊断 data part 给前端，
  // 再 merge 真正的对话流。这样前端能在 UI 上看到记忆系统每次请求的处理效果
  // （原始消息数 → 处理后消息数、是否触发摘要）。
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const diagnostic: MemoryDiagnostic = {
        originalCount,
        finalCount,
        summarized,
      };
      // transient: true 表示这段数据不会进入消息历史，只用于实时展示
      writer.write({
        type: "data-memory",
        data: diagnostic,
        transient: true,
      });

      const result = streamText({
        model: deepseek("deepseek-chat"),
        system: SYSTEM_PROMPT,
        messages: modelMessages,
        tools,
        // 关键：开启多步工具调用。模型可以"调工具 → 看结果 → 继续推理 → 再调工具"，
        // 最多循环 5 步，避免无限循环。没有这行，模型只会调一次工具就停。
        stopWhen: stepCountIs(5),
      });

      // 把对话流合并进来。sendStart: false 因为上面已经 write 了 start 等价的 data。
      writer.merge(result.toUIMessageStream({ sendStart: false }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}

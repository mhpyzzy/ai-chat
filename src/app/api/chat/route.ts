import { deepseek } from "@ai-sdk/deepseek";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { tools, type ChatMessage } from "@/lib/tools";

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

  const result = streamText({
    model: deepseek("deepseek-chat"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    // 关键：开启多步工具调用。模型可以"调工具 → 看结果 → 继续推理 → 再调工具"，
    // 最多循环 5 步，避免无限循环。没有这行，模型只会调一次工具就停。
    stopWhen: stepCountIs(5),
  });

  // toUIMessageStreamResponse 把 streamText 的结果转成 useChat 能消费的 UIMessage 流
  return result.toUIMessageStreamResponse();
}

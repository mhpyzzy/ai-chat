import {
  convertToModelMessages,
  generateText,
  pruneMessages,
  type ModelMessage,
} from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import type { ChatMessage } from "@/lib/tools";

/**
 * Agent 的记忆管理 —— 分两层：
 *
 * 1. 短期记忆（Working Memory）：当前对话历史。
 *    问题：对话越长，全量历史发给模型的 token 越多，费用越高，还可能撞上下文窗口。
 *    解决：用 pruneMessages 裁剪 —— 保留最近几轮的完整内容，
 *          但把更早的工具调用中间结果（输入输出 JSON）剥离，只留最终文本。
 *          模型记得"聊过什么"，但不背着一堆工具结果占 token。
 *
 * 2. 长期记忆（Long-term Memory）：跨会话的摘要。
 *    当对话超过阈值，用模型对前面的内容做摘要，压缩成一条 system 消息。
 *
 * 面试点：Memory 不是"要不要存"，而是"存多少、怎么压缩、什么时候裁剪"。
 */

// 触发摘要的阈值：消息数超过此值，前面的内容会被压缩成摘要
export const SUMMARY_THRESHOLD = 12;
// 裁剪策略：保留最近几条消息的完整工具调用结果，更早的只留文本
export const KEEP_FULL_TOOL_RECENT = 4;

const SUMMARY_SYSTEM_PROMPT = [
  "你是对话摘要助手。把多轮对话压缩成简洁的中文摘要，供后续对话延续上下文。",
  "要求：",
  "- 保留关键事实：用户问过什么、Agent 回答了什么结论、提到的人名/地名/数字",
  "- 保留用户的偏好和意图，例如用户想要退货、用户身处上海等关键信息",
  "- 丢弃寒暄、重复、无关细节",
  "- 用第三人称陈述，不超过 200 字",
].join("\n");

/**
 * 第 1 层：短期记忆裁剪。
 * 用 pruneMessages 剥离旧消息里的工具调用中间结果（这些 JSON 很占 token），
 * 只保留最近 KEEP_FULL_TOOL_RECENT 条消息的完整工具结果。
 *
 * 为什么：工具调用的输入输出往往是结构化 JSON（如知识库检索返回的上下文），
 * 体量大且对后续对话价值低——模型只需要记得"查过了什么"，不需要完整 JSON。
 */
export function applyShortTermMemory(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;

  return pruneMessages({
    messages,
    // 推理过程（reasoning）全部剥离：deepseek-chat 不返回 reasoning，
    // 但加上这行对带 reasoning 的模型（如 deepseek-reasoner）也安全
    reasoning: "all",
    // 工具调用裁剪：保留最近 N 条消息里的完整工具结果，更早的剥离
    toolCalls: `before-last-${KEEP_FULL_TOOL_RECENT}-messages`,
    // 裁剪后内容为空的消息直接删掉（比如只剩个工具调用壳的 assistant 消息）
    emptyMessages: "remove",
  });
}

/**
 * 第 2 层：长期记忆摘要。
 * 当消息数超过阈值，把前半部分压缩成一条摘要 system 消息。
 * 返回：处理后的消息数组（摘要 + 最近的消息）。
 *
 * 注意：这是"软触发"——超过阈值才摘要，否则原样返回。
 * 摘要本身是一次额外的模型调用，有成本，所以阈值不能设太低。
 */
export async function applyLongTermMemory(
  messages: ModelMessage[],
): Promise<{ messages: ModelMessage[]; summarized: boolean }> {
  // 未达阈值，不需要摘要
  if (messages.length <= SUMMARY_THRESHOLD) {
    return { messages, summarized: false };
  }

  // 把需要摘要的"旧消息"和要保留的"近期消息"分开
  const cutoff = messages.length - KEEP_FULL_TOOL_RECENT;
  const oldMessages = messages.slice(0, cutoff);
  const recentMessages = messages.slice(cutoff);

  // 把旧消息转成纯文本，交给模型做摘要
  const transcript = oldMessages
    .map((m) => {
      const role = m.role;
      // ModelMessage 的 content 可能是 string 或数组，统一取文本
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `${role}: ${text}`;
    })
    .join("\n");

  const { text: summary } = await generateText({
    model: deepseek("deepseek-chat"),
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: `请摘要以下对话历史：\n\n${transcript}`,
  });

  const summaryMessage: ModelMessage = {
    role: "system",
    content: `【之前的对话摘要】${summary}`,
  };

  return {
    messages: [summaryMessage, ...recentMessages],
    summarized: true,
  };
}

/**
 * 完整的记忆管线：UIMessage → ModelMessage → 短期裁剪 → 长期摘要。
 * 供 chat route 一次调用。
 */
export interface MemoryDiagnostic {
  originalCount: number;
  finalCount: number;
  summarized: boolean;
}

export async function manageMemory(
  messages: ChatMessage[],
): Promise<{
  modelMessages: ModelMessage[];
  summarized: boolean;
  originalCount: number;
  finalCount: number;
}> {
  const modelMessages = await convertToModelMessages(messages);
  const shortTermPruned = applyShortTermMemory(modelMessages);
  const { messages: finalMessages, summarized } =
    await applyLongTermMemory(shortTermPruned);

  return {
    modelMessages: finalMessages,
    summarized,
    // 诊断信息：让前端能看到记忆系统每次请求的处理效果
    originalCount: modelMessages.length,
    finalCount: finalMessages.length,
  };
}

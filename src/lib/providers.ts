import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * 阿里云百炼（DashScope）OpenAI 兼容 provider。
 * - base URL：百炼的 OpenAI 兼容入口
 * - 用途：text-embedding-v4 向量模型（RAG 的 Embedding 层）
 * 聊天模型继续走 deepseek（route.ts），embedding 走百炼，各司其职。
 */
export const bailian = createOpenAICompatible({
  name: "bailian",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY ?? "",
});

// 百炼 embedding 模型实例，供 embed()/embedMany() 使用
export const embeddingModel = bailian.embeddingModel("text-embedding-v4");

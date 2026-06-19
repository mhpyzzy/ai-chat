import { z } from "zod";

/**
 * Structured Output 的 Schema 定义。
 *
 * 这是 AI SDK 6 结构化输出的核心：把这段 Zod schema 传给 Output.object()，
 * AI SDK 会：
 *   1. 把 schema 转成 JSON Schema，作为约束发给模型
 *   2. 模型生成时受 schema 结构约束（structured output / 约束解码）
 *   3. 返回前再跑一次 Zod 运行时校验
 * 最终你拿到的是带 TS 类型的对象，而不是 any 或 JSON 字符串。
 *
 * 面试点：每个字段的 .describe() 不是给开发者看的注释，而是发给模型的「字段说明」，
 * 模型靠它理解每个字段要填什么。describe 写得越清楚，输出质量越高。
 */

// 情感倾向：用 enum 约束，模型只能从固定值里选，不能自由发挥
export const sentimentSchema = z.enum(["positive", "neutral", "negative"]);

// 优先级：业务方关心的「这条评价要不要紧急处理」
export const prioritySchema = z.enum(["low", "medium", "high"]);

// 单条分析结果的结构
export const reviewAnalysisSchema = z.object({
  sentiment: sentimentSchema.describe("用户评价的整体情感倾向"),
  score: z
    .number()
    .min(0)
    .max(10)
    .describe("满意度评分，0 表示极度不满，10 表示非常满意，整数"),
  summary: z
    .string()
    .max(80)
    .describe("用一句话概括用户的核心诉求或情绪，不超过 80 字"),
  tags: z
    .array(z.string())
    .describe("从评价中提取的关键标签，如「物流慢」「客服态度好」「质量好」"),
  priority: prioritySchema.describe(
    "处理优先级：差评/投诉为 high，建议为 medium，好评为 low",
  ),
  suggestedReply: z
    .string()
    .describe("给客服参考的回复话术，语气与情感倾向一致：差评要道歉+解决方案，好评要致谢"),
});

// 从 schema 推导出 TS 类型，前后端共用 —— 这就是 Structured Output 的类型安全收益
export type ReviewAnalysis = z.infer<typeof reviewAnalysisSchema>;

// 批量分析的请求体 schema（API 路由用它校验入参）
export const analyzeRequestSchema = z.object({
  review: z.string().min(1).max(2000),
});
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

import { deepseek } from "@ai-sdk/deepseek";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { analyzeRequestSchema, reviewAnalysisSchema } from "@/lib/schemas/analysis";

/**
 * Structured Output API：用户评价情感分析。
 *
 * 业务场景：电商/客服后台，用户提交评价后自动分析情感、打标签、排优先级、生成建议回复。
 * 这类「输入文本 → 结构化数据」的任务正是 Structured Output 的典型用法。
 */

export const maxDuration = 30;

const SYSTEM_PROMPT = [
  "你是一名专业的电商客服质量分析助手。",
  "任务：分析用户评价，输出结构化的分析结果。",
  "要求：",
  "- 基于评价原文客观分析，不要臆测用户没说的问题",
  "- score 反映整体满意度，差评 0-3，中评 4-6，好评 7-10",
  "- tags 提取具体问题点或优点，不要写空泛的词",
  "- priority：投诉/差评=high，改进建议/中性=medium，纯好评=low",
  "- suggestedReply 要符合情感：差评先道歉再给方案，好评表达感谢",
].join("\n");

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  // 入参校验：同样用 Zod，防止空字符串或超长输入
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数校验失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // AI SDK 6 的正确写法：generateText + output: Output.object({ schema })
    // （generateObject 在 v6 已废弃，迁移到 generateText + Output.object）
    const { output } = await generateText({
      model: deepseek("deepseek-chat"),
      system: SYSTEM_PROMPT,
      prompt: `请分析以下用户评价：\n\n${parsed.data.review}`,
      output: Output.object({
        schema: reviewAnalysisSchema,
        name: "ReviewAnalysis",
        description: "对一条用户评价的结构化分析结果",
      }),
    });

    // output 的类型由 schema 推导而来，这里已经是 ReviewAnalysis 而非 any
    return NextResponse.json({ analysis: output });
  } catch (err) {
    console.error("[analyze] 分析失败:", err);
    return NextResponse.json({ error: "分析失败，请稍后重试" }, { status: 500 });
  }
}

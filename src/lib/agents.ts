import { deepseek } from "@ai-sdk/deepseek";
import { generateText, Output } from "ai";
import { z } from "zod";
import { formatContextWithSources, retrieve } from "@/lib/rag";
import type { SearchResult } from "@/lib/vector-store";

/**
 * 多 Agent 工作流 —— 内容创作 pipeline。
 *
 * 这是 Agent 学习路径中最综合的一步：把前面学的能力串联成一个自动化流程。
 *
 * 业务场景（真实可落地）：
 *   内容运营输入「写一篇退换货政策指南」→
 *   规划 Agent 拆解结构 → 研究 Agent 检索知识库补充事实 → 写作 Agent 产出成品。
 *
 * 三个 Agent 各司其职，通过显式编排（而非自主委托）串联：
 *   1. planContent   — Structured Output，把模糊需求拆成结构化计划
 *   2. researchContent — 纯检索 Agent（复用 RAG），为每个研究问题检索知识库
 *   3. writeContent  — 汇总计划 + 研究资料，生成最终内容
 *
 * 为什么用显式编排而非 subagent delegation：
 *   内容创作有固定步骤，显式编排更可控、可调试、可解释。
 *   每步的输入输出都清晰可见，出问题时能定位到哪一步。
 *   真实工程中多数工作流都是这种模式（LangGraph / Inngest / Temporal 的思路）。
 */

// ============ 类型定义 ============

/**
 * 规划 Agent 的输出 schema。
 * 这是 Structured Output 的核心：模型受 schema 约束，输出的每个字段都有类型保证。
 */
export const contentPlanSchema = z.object({
  title: z.string().describe("吸引人且准确反映内容主题的标题"),
  outline: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("内容大纲，每项是一个章节标题，逻辑递进"),
  researchQueries: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("需要从知识库检索的问题，用于补充事实、数据、政策细节"),
  writingRequirements: z
    .string()
    .describe("写作要求：目标受众、核心信息、必须包含的关键点"),
  tone: z
    .string()
    .describe("写作风格，如「专业严谨」「轻松活泼」「真诚温暖」"),
  wordCount: z.number().min(200).max(3000).describe("目标字数"),
});
export type ContentPlan = z.infer<typeof contentPlanSchema>;

/** 单个研究问题的检索结果 */
export interface ResearchFinding {
  query: string;
  found: boolean;
  sources: Array<{ title: string; similarity: number }>;
  context: string;
}

/** 研究 Agent 的汇总输出 */
export interface ResearchResult {
  findings: ResearchFinding[];
  combinedContext: string;
  hasContent: boolean;
}

/** 写作 Agent 的输出 */
export interface WritingResult {
  content: string;
  charCount: number;
}

/** 完整工作流结果 */
export interface WorkflowResult {
  requirement: string;
  plan: ContentPlan;
  research: ResearchResult;
  writing: WritingResult;
}

/**
 * SSE 进度事件类型（discriminated union）。
 * 前端通过 step + status 判断当前进度，result 类型也随之确定。
 */
export type WorkflowProgress =
  | { step: "plan"; status: "running" }
  | { step: "plan"; status: "done"; result: ContentPlan }
  | { step: "research"; status: "running" }
  | { step: "research"; status: "done"; result: ResearchResult }
  | { step: "write"; status: "running" }
  | { step: "write"; status: "done"; result: WritingResult }
  | { step: "complete"; result: WorkflowResult }
  | { step: "error"; message: string };

/** 进度回调：API 层用它做 SSE 推送，测试时可以不传 */
type ProgressCallback = (update: WorkflowProgress) => void;

// ============ Agent 1: 规划 ============

const PLANNER_PROMPT = [
  "你是一名资深内容策划专家，擅长把模糊的创作需求拆解成可执行的写作计划。",
  "任务：分析用户的内容创作需求，制定结构化的创作计划。",
  "",
  "输出要求：",
  "- title：吸引人且准确反映内容主题",
  "- outline：3-6 个章节，逻辑递进，每个章节用一个短语概括",
  "- researchQueries：1-4 个需要从知识库检索的问题，用于补充事实、数据、政策细节",
  "- writingRequirements：明确目标受众、核心信息、必须包含的关键点",
  "- tone：与内容类型匹配的语气",
  "- wordCount：合理的目标字数（通常 500-1500 字）",
  "",
  "重要：如果用户需求涉及具体产品、政策、服务信息，researchQueries 应包含",
  "能从知识库检索到这些内容的问题（如「退换货政策」「配送时效」）。",
].join("\n");

export async function planContent(requirement: string): Promise<ContentPlan> {
  const { output } = await generateText({
    model: deepseek("deepseek-chat"),
    system: PLANNER_PROMPT,
    prompt: `用户需求：${requirement}`,
    output: Output.object({
      schema: contentPlanSchema,
      name: "ContentPlan",
      description: "内容创作计划",
    }),
  });
  return output;
}

// ============ Agent 2: 研究（RAG 检索） ============

/**
 * 研究 Agent：纯检索，不调 LLM。
 *
 * 设计理由：不是每个 Agent 都需要 LLM 推理。研究 Agent 的职责是「收集事实」，
 * 用向量检索就够了。这比让 LLM 再总结一次更快、更便宜、更可控。
 * （面试可聊：tool-only agent vs reasoning agent 的取舍）
 *
 * 对每个 researchQuery 做独立检索，然后合并去重。
 */
export async function researchContent(
  plan: ContentPlan,
): Promise<ResearchResult> {
  const findings: ResearchFinding[] = [];
  // 用 chunk 文本做去重 key，避免同一个段落被多个 query 重复检索
  const seenContent = new Set<string>();
  const contexts: string[] = [];

  for (const query of plan.researchQueries) {
    const results: SearchResult[] = await retrieve(query, 3);

    if (results.length === 0) {
      findings.push({ query, found: false, sources: [], context: "" });
      continue;
    }

    // 去重：跨 query 合并，避免同一段落出现两次
    const deduped: SearchResult[] = [];
    for (const r of results) {
      if (!seenContent.has(r.content)) {
        seenContent.add(r.content);
        deduped.push(r);
      }
    }

    // 去重后可能为空（该 query 检索到的内容已被前面的 query 覆盖）
    if (deduped.length === 0) {
      findings.push({ query, found: false, sources: [], context: "" });
      continue;
    }

    const context = formatContextWithSources(deduped);
    contexts.push(context);
    findings.push({
      query,
      found: true,
      context,
      sources: deduped.map((r) => ({
        title: r.metadata.title,
        similarity: Number(r.similarity.toFixed(3)),
      })),
    });
  }

  return {
    findings,
    combinedContext: contexts.join("\n\n---\n\n"),
    hasContent: contexts.length > 0,
  };
}

// ============ Agent 3: 写作 ============

const WRITER_PROMPT = [
  "你是一名专业的文案撰稿人，能根据创作计划和参考资料写出高质量内容。",
  "",
  "写作原则：",
  "- 严格按照大纲结构组织内容，每个章节都要展开",
  "- 语气和风格必须符合计划要求",
  "- 有参考资料时，必须基于资料中的事实写作，在相关段落后标注来源（格式：来源：《标题》）",
  "- 没有参考资料时，基于你的专业知识完成，但不要编造具体数据",
  "- 开头要有引入，结尾要有总结",
  "- 直接输出正文，不要加「以下是文章」之类的开场白",
].join("\n");

export async function writeContent(
  plan: ContentPlan,
  research: ResearchResult,
): Promise<WritingResult> {
  const contextSection = research.hasContent
    ? `\n\n【知识库参考资料】\n${research.combinedContext}\n\n请在写作中合理引用上述资料，并在相关段落标注来源。`
    : "\n\n（知识库中暂无直接相关内容，请基于你的专业知识完成写作。）";

  const { text } = await generateText({
    model: deepseek("deepseek-chat"),
    system: WRITER_PROMPT,
    prompt: [
      `创作计划：`,
      `标题：${plan.title}`,
      `大纲：\n${plan.outline.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}`,
      `写作要求：${plan.writingRequirements}`,
      `语气：${plan.tone}`,
      `目标字数：${plan.wordCount} 字${contextSection}`,
    ].join("\n"),
  });

  return { content: text, charCount: text.length };
}

// ============ 编排函数 ============

/**
 * 显式编排：按固定顺序串联三个 Agent，每步完成后通过回调推送进度。
 *
 * 与 subagent delegation（Agent 自己决定调用谁）的区别：
 * 编排函数掌控全局流程，Agent 只负责自己的单步任务。
 * 适合步骤固定的场景（内容创作、数据处理、审批流）。
 */
export async function runContentWorkflow(
  requirement: string,
  onProgress?: ProgressCallback,
): Promise<WorkflowResult> {
  onProgress?.({ step: "plan", status: "running" });
  const plan = await planContent(requirement);
  onProgress?.({ step: "plan", status: "done", result: plan });

  onProgress?.({ step: "research", status: "running" });
  const research = await researchContent(plan);
  onProgress?.({ step: "research", status: "done", result: research });

  onProgress?.({ step: "write", status: "running" });
  const writing = await writeContent(plan, research);
  onProgress?.({ step: "write", status: "done", result: writing });

  const result: WorkflowResult = { requirement, plan, research, writing };
  onProgress?.({ step: "complete", result });
  return result;
}

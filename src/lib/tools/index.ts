import { type InferUITools, type ToolSet, type UIDataTypes, type UIMessage, tool } from "ai";
import { z } from "zod";
import { formatContextWithSources, retrieve } from "@/lib/rag";
import { saveMemory as saveMemoryToDb, type MemoryCategory } from "@/lib/memory-store";

/**
 * 工具集合工厂 —— Agent 的"手脚"。
 *
 * 每个工具 = description（告诉模型什么时候调）+ inputSchema（用 zod 约束参数）+ execute（真正执行的函数）。
 * 模型只能"看到" description 和 inputSchema，execute 是服务端私有逻辑。
 *
 * 改成工厂函数（而非静态对象）：save_memory 需要知道当前登录用户的 ID，
 * 通过闭包注入 userId，每个请求创建独立的工具集，实现用户数据隔离。
 */

// 工具 1：天气查询（mock 数据，真实项目里换成 OpenWeather / 和风天气 API）
const getWeather = tool({
  description:
    "获取指定城市的当前天气，包括温度、天气状况和湿度。当用户询问某个城市天气、是否需要带伞、穿什么等问题时调用。",
  inputSchema: z.object({
    city: z.string().describe('城市名称，例如 "北京"、"上海"、"Tokyo"'),
  }),
  execute: async ({ city }) => {
    const mock: Record<string, { temp: number; condition: string; humidity: number }> = {
      北京: { temp: 28, condition: "晴", humidity: 45 },
      上海: { temp: 25, condition: "多云", humidity: 65 },
      广州: { temp: 31, condition: "雷阵雨", humidity: 80 },
      Tokyo: { temp: 22, condition: "cloudy", humidity: 60 },
    };
    const data = mock[city] ?? { temp: 22, condition: "晴", humidity: 50 };
    return { city, ...data, unit: "°C", updatedAt: new Date().toISOString() };
  },
});

// 工具 2：数学计算（安全求值，演示结构化输入 → 结构化输出）
const calculate = tool({
  description: "执行数学表达式计算，支持加减乘除和括号。当用户需要精确计算（如价格、数量、比例）时调用，不要自己心算。",
  inputSchema: z.object({
    expression: z.string().describe('要计算的数学表达式，例如 "(100 + 200) * 0.8"'),
  }),
  execute: async ({ expression }) => {
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      return { expression, error: "表达式包含不支持的字符，仅允许数字和 + - * / ( )" };
    }
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      return { expression, result: Number(result) };
    } catch {
      return { expression, error: "计算失败，请检查表达式格式" };
    }
  },
});

// 工具 3：时间查询
const getTime = tool({
  description: "获取指定时区的当前时间。当用户问现在几点、今天日期或需要时间信息时调用。",
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA 时区名，例如 "Asia/Shanghai"、"America/New_York"，不传默认用系统本地时区'),
  }),
  execute: async ({ timezone }) => {
    const now = new Date();
    try {
      const formatted = new Intl.DateTimeFormat("zh-CN", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);
      return { timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, currentTime: formatted };
    } catch {
      return { timezone: timezone ?? "unknown", error: "无效的时区，请使用 IANA 格式如 Asia/Shanghai" };
    }
  },
});

// 工具 4：知识库检索（Agentic RAG 的核心）
const searchKnowledgeBase = tool({
  description:
    "搜索知识库，查找与用户问题相关的内部资料（如产品文档、FAQ、政策、手册等）。" +
    "当用户询问公司产品、业务规则、具体事实、文档内容、或任何需要查阅资料才能准确回答的问题时调用。" +
    "对于闲聊、通用常识、数学计算、天气查询等不需要查知识库的问题，不要调用本工具。",
  inputSchema: z.object({
    query: z
      .string()
      .describe("用于检索的查询词，应聚焦于用户想了解的具体信息，例如「退货政策」「配送时效」"),
  }),
  execute: async ({ query }) => {
    const results = await retrieve(query, 4);
    if (results.length === 0) {
      return { query, found: false, message: "知识库中未找到相关内容" };
    }
    return {
      query,
      found: true,
      context: formatContextWithSources(results),
      sources: results.map((r) => ({
        title: r.metadata.title,
        similarity: Number(r.similarity.toFixed(3)),
      })),
    };
  },
});

/**
 * 创建工具集。save_memory 通过闭包拿到当前登录用户 ID。
 * 其他工具不依赖用户上下文，直接复用。
 */
export function createTools(userId: string): ToolSet {
  // 工具 5：保存记忆 —— 闭包注入 userId，实现按用户隔离
  const saveMemory = tool({
    description:
      "当用户透露值得长期记住的信息时调用，把信息保存到记忆库。" +
      "适用场景：用户提到个人信息（如所在地、职业、负责的业务）、" +
      "偏好（如喜欢简洁回答、偏好某种语言）、长期指令（如回答时附带代码示例）。" +
      "不要存：临时信息、单次对话的上下文、寒暄。",
    inputSchema: z.object({
      category: z
        .enum(["preference", "fact", "instruction"])
        .describe("记忆类别：preference=偏好，fact=事实，instruction=长期指令"),
      content: z
        .string()
        .max(200)
        .describe("精简的记忆内容，用陈述句，不超过 200 字。例如「用户在上海工作」「用户偏好简洁的回答」"),
    }),
    execute: async ({ category, content }) => {
      const result = await saveMemoryToDb(userId, category as MemoryCategory, content);
      return {
        category,
        content,
        action: result.action,
        message: result.action === "created" ? "已记住这条信息" : "已更新这条记忆",
      };
    },
  });

  return {
    getWeather,
    calculate,
    getTime,
    searchKnowledgeBase,
    save_memory: saveMemory,
  } satisfies ToolSet;
}

// 下面两个类型给前端 useChat 用，让 tool part 渲染获得完整类型提示
export type ChatTools = InferUITools<{
  getWeather: typeof getWeather;
  calculate: typeof calculate;
  getTime: typeof getTime;
  searchKnowledgeBase: typeof searchKnowledgeBase;
  save_memory: ReturnType<typeof createTools>["save_memory"];
}>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

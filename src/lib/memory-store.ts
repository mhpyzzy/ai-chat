import { and, desc, eq } from "drizzle-orm";
import { db, memories } from "@/db";

/**
 * 持久化记忆存储 —— 跨会话的用户记忆读写。
 *
 * 参考 ChatGPT Memory 的设计：
 *   - 不存对话原文，只存 Agent 提取的精简事实/偏好
 *   - 每轮对话开始全量注入 system prompt（记忆条目少时最优）
 *   - 当条目增长到几百条以上，再升级为向量检索
 *
 * 与 memory.ts（上下文管理）互补：
 *   memory.ts      —— 单次对话内的 token 裁剪和摘要，会话结束即失
 *   memory-store.ts —— 跨会话持久化，存数据库，关掉对话再开还在
 */

// demo 阶段的固定用户 ID。接 Supabase Auth 后从会话信息提取真实用户 ID。
export const DEMO_USER_ID = "demo-user";

/** 记忆类别：和 schema 里的 category 字段对应 */
export type MemoryCategory = "preference" | "fact" | "instruction";

/** 单条记忆条目 */
export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 读取用户的所有记忆，按更新时间倒序（最近更新的在前）。
 * 用于每轮对话开始时拼进 system prompt。
 */
export async function getUserMemories(
  userId: string = DEMO_USER_ID,
): Promise<MemoryEntry[]> {
  const rows = await db
    .select({
      id: memories.id,
      category: memories.category,
      content: memories.content,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    category: row.category as MemoryCategory,
    content: row.content,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }));
}

/**
 * 写入一条记忆。被 saveMemory 工具调用（Agent 自主判断后触发）。
 *
 * 去重策略：如果已存在内容相同的记忆，更新它而不是新增。
 * 简单的精确匹配去重；记忆量大了可以升级成语义相似度去重。
 */
export async function saveMemory(
  userId: string,
  category: MemoryCategory,
  content: string,
): Promise<{ id: string; action: "created" | "updated" }> {
  // 查是否已有相同 category + content 的记忆
  const existing = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.category, category),
        eq(memories.content, content),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    // 已存在：只更新时间戳（内容相同，无需改）
    await db
      .update(memories)
      .set({ updatedAt: new Date() })
      .where(eq(memories.id, existing[0].id));
    return { id: existing[0].id, action: "updated" };
  }

  // 不存在：新增
  const [created] = await db
    .insert(memories)
    .values({ userId, category, content })
    .returning({ id: memories.id });
  return { id: created.id, action: "created" };
}

/** 删除单条记忆 */
export async function deleteMemory(
  memoryId: string,
  userId: string = DEMO_USER_ID,
): Promise<boolean> {
  const result = await db
    .delete(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)));
  return (result.rowCount ?? 0) > 0;
}

/** 清空用户的所有记忆 */
export async function clearUserMemories(
  userId: string = DEMO_USER_ID,
): Promise<number> {
  const result = await db.delete(memories).where(eq(memories.userId, userId));
  return result.rowCount ?? 0;
}

/**
 * 把用户记忆拼成 system prompt 片段，注入对话的 system prompt。
 * 记忆条目少时全量注入；条目多了再改成检索式。
 */
export function formatMemoriesForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";

  const categoryLabel: Record<MemoryCategory, string> = {
    preference: "偏好",
    fact: "事实",
    instruction: "指令",
  };

  const lines = entries.map(
    (e) => `- [${categoryLabel[e.category]}] ${e.content}`,
  );

  return [
    "【关于用户的长期记忆（跨会话保留，优先遵循）】",
    ...lines,
  ].join("\n");
}

import { index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

/**
 * 数据库表结构定义 —— RAG 知识库的数据层。
 *
 * 两张表：
 *   documents —— 文档元信息（标题、创建时间），一个文档对应多个 chunk
 *   chunks    —— 文档分块 + 向量，是向量检索的核心
 *
 * 替代了原来的文件型存储（src/lib/vector-store.ts 的 .data/vector-store.json）。
 * 好处：并发安全、持久化、支持 HNSW 索引的向量检索（百万级数据也能毫秒返回）。
 *
 * pgvector 关键点（面试高频）：
 *   - vector(1024)：维度写死，必须和 embedding 模型一致
 *     （百炼 text-embedding-v4 输出 1024 维）
 *   - HNSW 索引 + vector_cosine_ops：用余弦相似度做近似最近邻检索
 *     比暴力全表扫描快几个数量级，代价是多占点内存
 */

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // 向量列：1024 维，和百炼 text-embedding-v4 一致
    embedding: vector("embedding", { dimensions: 1024 }),
    chunkIndex: integer("chunk_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // HNSW 索引用余弦相似度：向量检索从 O(n) 暴力扫描变成近似对数级
    index("embedding_index")
      .using("hnsw", table.embedding.op("vector_cosine_ops"))
      .with({ m: 16, efConstruction: 64 }),
  ],
);

// 导出类型供 vector-store.ts 和其他模块使用
export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type NewChunk = typeof chunks.$inferInsert;

/**
 * 持久化记忆表 —— 跨会话的用户记忆。
 *
 * 与 memory.ts 的上下文管理（裁剪 + 摘要）互补：
 *   - 上下文管理管"单次对话怎么省 token"，会话结束即失
 *   - 持久化记忆管"跨多次对话记住用户"，存数据库
 *
 * 存储 Agent 提取的精简事实/偏好（不存对话原文），参考 ChatGPT Memory 的做法：
 * Agent 判断"这个信息值得记住"时主动写入，每轮对话全量注入 system prompt。
 *
 * category 取值：
 *   preference  — 用户偏好（如"喜欢简洁回答"、"偏好 Python"）
 *   fact        — 用户事实（如"在上海工作"、"负责退换货业务"）
 *   instruction — 长期指令（如"回答时附带代码示例"）
 */
export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase Auth 的 auth.uid() 返回 uuid，直接对齐
  userId: uuid("user_id").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MemoryRow = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

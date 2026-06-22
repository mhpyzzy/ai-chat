import { cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { db, chunks, documents } from "@/db";

/**
 * 向量库 —— RAG 的存储层（已升级为 PostgreSQL + pgvector）。
 *
 * 改造前：文件型存储（.data/vector-store.json），纯内存余弦相似度。
 * 改造后：Supabase PostgreSQL + pgvector 扩展 + HNSW 索引。
 *
 * 为什么升级：
 *   1. 持久化：部署到 Vercel 后文件系统是临时的，数据会丢
 *   2. 并发安全：多人同时上传不再互相覆盖
 *   3. 性能：HNSW 索引让向量检索从 O(n) 全表扫描变成近似对数级
 *   4. 生产架构：pgvector 是企业级 RAG 的标准选择
 *
 * 对外接口完全不变（addChunks / search / listDocuments / deleteDocument / countChunks），
 * 所以上层 rag.ts、tools、agents、MCP Server 一行都不用改。
 */

// ============ 类型定义（保持兼容，上层代码不用改） ============

export interface ChunkMetadata {
  /** 来源文档标题，用于回答时标注引用 */
  title: string;
  /** 这个 chunk 在原文中的序号，用于排序 */
  index: number;
}

export interface VectorRecord {
  id: string;
  content: string;
  embedding: number[];
  metadata: ChunkMetadata;
  createdAt: number;
}

export interface SearchResult extends VectorRecord {
  similarity: number;
}

// ============ 写入 ============

/**
 * 批量写入向量记录（上传文档后调用）。
 *
 * 数据库是两张表（documents + chunks），但上层传入的是扁平的 VectorRecord。
 * 这里负责转换：按 title 分组 → 创建/复用 document → 插入 chunks。
 */
export async function addChunks(records: VectorRecord[]): Promise<void> {
  if (records.length === 0) return;

  await db.transaction(async (tx) => {
    // 按 title 分组，每个 title 对应一个 document
    const byTitle = new Map<string, VectorRecord[]>();
    for (const record of records) {
      const title = record.metadata.title;
      if (!byTitle.has(title)) byTitle.set(title, []);
      byTitle.get(title)!.push(record);
    }

    for (const [title, group] of byTitle) {
      // 查 document 是否已存在（重复上传同名文档时复用）
      const existing = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.title, title))
        .limit(1);

      let documentId: string;
      if (existing.length > 0) {
        documentId = existing[0].id;
      } else {
        const [created] = await tx
          .insert(documents)
          .values({ title })
          .returning({ id: documents.id });
        documentId = created.id;
      }

      await tx.insert(chunks).values(
        group.map((record) => ({
          documentId,
          content: record.content,
          // drizzle 的 vector 列自动处理 number[] ↔ pgvector 格式
          embedding: record.embedding,
          chunkIndex: record.metadata.index,
        })),
      );
    }
  });
}

// ============ 检索 ============

/**
 * 按查询向量检索最相关的 Top-K chunk。
 *
 * 用 pgvector 的 cosineDistance + HNSW 索引，比原来的纯内存计算快得多。
 * cosineDistance 返回的是距离（0=完全相同，2=完全相反），
 * 相似度 = 1 - 距离。
 */
export async function search(
  queryEmbedding: number[],
  topK = 4,
  minSimilarity = 0.3,
): Promise<SearchResult[]> {
  const distance = cosineDistance(chunks.embedding, queryEmbedding);
  const similarity = sql<number>`1 - (${distance})`;

  const rows = await db
    .select({
      id: chunks.id,
      content: chunks.content,
      embedding: chunks.embedding,
      title: documents.title,
      chunkIndex: chunks.chunkIndex,
      createdAt: chunks.createdAt,
      similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(gt(similarity, minSimilarity))
    .orderBy(desc(similarity))
    .limit(topK);

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    // drizzle 自动把 pgvector 解析成 number[]
    embedding: row.embedding ?? [],
    metadata: {
      title: row.title,
      index: row.chunkIndex,
    },
    createdAt: row.createdAt.getTime(),
    similarity: row.similarity,
  }));
}

// ============ 列表 ============

/** 列出所有来源文档标题（去重），用于知识库管理页展示 */
export async function listDocuments(): Promise<
  { title: string; chunkCount: number; createdAt: number }[]
> {
  const rows = await db
    .select({
      title: documents.title,
      chunkCount: sql<number>`cast(count(${chunks.id}) as int)`,
      createdAt: sql<number>`cast(extract(epoch from max(${chunks.createdAt})) * 1000 as bigint)`,
    })
    .from(documents)
    .leftJoin(chunks, eq(chunks.documentId, documents.id))
    .groupBy(documents.id, documents.title)
    .orderBy(desc(documents.createdAt));

  return rows.map((row) => ({
    title: row.title,
    chunkCount: Number(row.chunkCount),
    createdAt: Number(row.createdAt),
  }));
}

// ============ 删除 ============

/** 按文档标题删除所有相关 chunk（cascade 连带删除 document） */
export async function deleteDocument(title: string): Promise<number> {
  // 先统计 chunk 数量，再删 document（外键 cascade 自动删 chunks）
  const target = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.title, title));

  if (target.length === 0) return 0;

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(chunks)
    .where(eq(chunks.documentId, target[0].id));

  await db.delete(documents).where(eq(documents.id, target[0].id));
  return Number(countResult[0].count);
}

// ============ 统计 ============

/** 统计当前知识库规模（chunk 总数） */
export async function countChunks(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(chunks);
  return Number(result.count);
}

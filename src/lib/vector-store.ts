import { promises as fs } from "node:fs";
import path from "node:path";
import { cosineSimilarity } from "ai";

/**
 * 文件型向量库 —— RAG 的存储层。
 *
 * 为什么不用 pgvector / Pinecone：
 *   学习阶段零基础设施成本（不用 Docker / Postgres），小到中型知识库完全够用。
 *   生产升级时，只需把本文件的 CRUD 换成 SQL 查询，上层（rag.ts / route.ts）不用改。
 *
 * 存储格式：单个 JSON 文件，结构为 { chunks: VectorRecord[] }。
 * 每个 chunk 记录原始内容、embedding 向量、来源文档元信息。
 */

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
  /** 写入时间戳，用于按时间排序/清理 */
  createdAt: number;
}

interface StoreShape {
  chunks: VectorRecord[];
}

// 向量库文件位置：项目根目录下 .data/vector-store.json（已在 .gitignore）
const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "vector-store.json");

// 单文件读：不存在时返回空库，保证首次运行不报错
async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return { chunks: [] };
  }
}

// 单文件写：目录不存在则先建
async function writeStore(store: StoreShape): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

/** 批量写入向量记录（上传文档后调用） */
export async function addChunks(records: VectorRecord[]): Promise<void> {
  if (records.length === 0) return;
  const store = await readStore();
  store.chunks.push(...records);
  await writeStore(store);
}

/**
 * 按查询向量检索最相关的 Top-K chunk。
 * 纯内存余弦相似度：逐条计算并排序，适合文件型存储的规模。
 */
export interface SearchResult extends VectorRecord {
  similarity: number;
}

export async function search(
  queryEmbedding: number[],
  topK = 4,
  minSimilarity = 0.3,
): Promise<SearchResult[]> {
  const store = await readStore();
  return store.chunks
    .map((chunk) => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/** 列出所有来源文档标题（去重），用于知识库管理页展示 */
export async function listDocuments(): Promise<
  { title: string; chunkCount: number; createdAt: number }[]
> {
  const store = await readStore();
  const byTitle = new Map<string, { title: string; chunkCount: number; createdAt: number }>();
  for (const chunk of store.chunks) {
    const existing = byTitle.get(chunk.metadata.title);
    if (existing) {
      existing.chunkCount += 1;
      existing.createdAt = Math.max(existing.createdAt, chunk.createdAt);
    } else {
      byTitle.set(chunk.metadata.title, {
        title: chunk.metadata.title,
        chunkCount: 1,
        createdAt: chunk.createdAt,
      });
    }
  }
  return [...byTitle.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** 按文档标题删除所有相关 chunk */
export async function deleteDocument(title: string): Promise<number> {
  const store = await readStore();
  const before = store.chunks.length;
  store.chunks = store.chunks.filter((c) => c.metadata.title !== title);
  await writeStore(store);
  return before - store.chunks.length;
}

/** 统计当前知识库规模（chunk 总数） */
export async function countChunks(): Promise<number> {
  const store = await readStore();
  return store.chunks.length;
}

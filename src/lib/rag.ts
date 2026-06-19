import { embed, embedMany } from "ai";
import { nanoid } from "nanoid";
import { embeddingModel } from "@/lib/providers";
import {
  addChunks,
  type SearchResult,
  search,
  type VectorRecord,
} from "@/lib/vector-store";

/**
 * RAG 检索层 —— 连接"文档上传"和"Agent 检索"的中间层。
 *
 * RAG 五要素（面试高频）：
 *   1. Chunking 切分：长文档切成可检索的小块（本文件 splitIntoChunks）
 *   2. Embedding：文本转向量（百炼 text-embedding-v4，1024 维）
 *   3. 检索策略：余弦相似度 + Top-K + 阈值过滤（vector-store.ts）
 *   4. Prompt 拼接：把检索到的上下文塞进 system prompt（formatContextWithSources）
 *   5. 引用来源：回答时标注来自哪个文档（formatContextWithSources）
 */

// 每块目标长度（字符）。中文按字符计更直观，1024 维 embedding 能容纳的语义量约在这个范围
const TARGET_CHUNK_SIZE = 500;

/**
 * 文档切分：按段落优先，超长段落再按句子切，保证语义完整。
 * 比"按句号切"更稳：不会把列表、短句切得太碎。
 */
export function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  // 先按空行/换行切成段落候选
  const paragraphs = normalized
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
    buffer = "";
  };

  for (const para of paragraphs) {
    // 段落本身超长：按句号/分号再切成句子，再累积
    if (para.length > TARGET_CHUNK_SIZE) {
      flush();
      const sentences = para
        .split(/(?<=[。.!！?？;；\n])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const sentence of sentences) {
        if ((buffer + "\n" + sentence).length > TARGET_CHUNK_SIZE) {
          flush();
        }
        buffer = buffer.length === 0 ? sentence : `${buffer}${sentence}`;
      }
      flush();
      continue;
    }

    // 常规段落：累积到目标长度再 flush
    if ((buffer + "\n" + para).length > TARGET_CHUNK_SIZE) {
      flush();
    }
    buffer = buffer.length === 0 ? para : `${buffer}\n${para}`;
  }
  flush();

  return chunks.filter((c) => c.length > 0);
}

/** 把单段文本转成 embedding 向量（用于查询） */
export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: query.replace(/\n/g, " "),
  });
  return embedding;
}

/**
 * 上传文档入库：切分 → 批量 embedding → 写入向量库。
 * 返回切分出的 chunk 数，供前端反馈。
 */
export async function ingestDocument(
  title: string,
  content: string,
): Promise<{ chunkCount: number }> {
  const chunks = splitIntoChunks(content);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // 批量 embedding：一次请求处理所有 chunk，比逐条快得多
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });

  const records: VectorRecord[] = chunks.map((content, index) => ({
    id: nanoid(),
    content,
    embedding: embeddings[index],
    metadata: { title, index },
    createdAt: Date.now(),
  }));

  await addChunks(records);
  return { chunkCount: chunks.length };
}

/** 检索：查询文本 → embedding → Top-K 相似 chunk */
export async function retrieve(
  query: string,
  topK = 4,
): Promise<SearchResult[]> {
  const queryEmbedding = await embedQuery(query);
  return search(queryEmbedding, topK);
}

/**
 * 把检索结果拼成给 LLM 的上下文字符串，并标注每段的来源文档。
 * 这是 RAG 第 4、5 步：Prompt 拼接 + 引用来源。
 */
export function formatContextWithSources(results: SearchResult[]): string {
  if (results.length === 0) return "";
  return results
    .map((r, i) => `[${i + 1}] 来源：《${r.metadata.title}》\n${r.content}`)
    .join("\n\n---\n\n");
}

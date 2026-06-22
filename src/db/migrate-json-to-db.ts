import { config } from "dotenv";
// tsx 脚本不自动加载 .env.local，需手动加载
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addChunks, countChunks, type VectorRecord } from "@/lib/vector-store";

/**
 * 一次性数据迁移脚本：把旧的文件型向量库（.data/vector-store.json）
 * 的数据迁移到 PostgreSQL + pgvector。
 *
 * 复用现有的 addChunks（Drizzle 写入逻辑），不重复造轮子。
 *
 * 运行：npx tsx src/db/migrate-json-to-db.ts
 */
async function main() {
  const jsonPath = resolve(process.cwd(), ".data/vector-store.json");

  let raw: string;
  try {
    raw = readFileSync(jsonPath, "utf8");
  } catch {
    console.log("没有找到 .data/vector-store.json，无需迁移");
    return;
  }

  const { chunks } = JSON.parse(raw) as { chunks: VectorRecord[] };
  if (chunks.length === 0) {
    console.log("向量库为空，无需迁移");
    return;
  }

  console.log(`从 JSON 读取了 ${chunks.length} 个 chunk，开始写入数据库...`);
  await addChunks(chunks);

  const total = await countChunks();
  console.log(`✓ 迁移完成，数据库现有 ${total} 个 chunk`);
}

main().catch((err) => {
  console.error("迁移失败:", err);
  process.exit(1);
});

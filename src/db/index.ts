import { config } from "dotenv";

// Next.js 运行时自动加载 .env.local，但 tsx 脚本不会。
// dotenv 默认不覆盖已有变量，所以在 Next.js 下重复加载是安全的。
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import { documents, chunks } from "@/db/schema";

/**
 * 数据库连接单例。
 *
 * 用 node-postgres (pg) 驱动连接 Supabase 的 PostgreSQL。
 * DATABASE_URL 来自 .env.local，格式：
 *   postgresql://postgres:password@db.xxx.supabase.co:5432/postgres?sslmode=require
 *
 * 全局复用同一个连接池：避免每个请求都新建连接（TCP 握手开销大）。
 * node-postgres 默认连接池大小 10，对中小规模应用足够。
 */
export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL,
    // Supabase pooler 的证书链不被 Node 默认信任，开发环境跳过验证
    // 生产环境应配置正确的 CA 证书（supabase 提供的 prod-ca）
    ssl: { rejectUnauthorized: false },
  },
  schema: { documents, chunks },
});

// 重新导出 schema 类型，方便其他模块统一从 @/db 引入
export { documents, chunks } from "@/db/schema";
export type {
  DocumentRow,
  ChunkRow,
  NewDocument,
  NewChunk,
} from "@/db/schema";

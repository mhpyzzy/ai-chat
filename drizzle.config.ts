import { config } from "dotenv";

// drizzle-kit 不会自动加载 .env.local，需手动加载
// （密码含特殊字符时用 dotenv 读文件最可靠，避免 shell source 的转义问题）
config({ path: ".env.local" });
// drizzle-kit 做 schema introspection 需要会话级连接。
// Supabase 的 6543 端口是 transaction pooler（PgBouncer），不支持 prepared statements，
// 会导致 pull schema 卡住。这里自动把端口换成直连端口 5432。
// 应用运行时用 6543（pooler，适合 Serverless 多连接），迁移时用 5432（直连）。
// const migrationUrl = (() => {
//   const raw = process.env.DATABASE_URL ?? "";
//   try {
//     const u = new URL(raw);
//     if (u.port === "6543") u.port = "5432";
//     return u.toString();
//   } catch {
//     return raw;
//   }
// })();

import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit 配置 —— 管理数据库 schema 和迁移。
 *
 * 用 `pnpm db:push`（drizzle-kit push）直接把 schema 推到数据库。
 * 端口：自动用 5432 直连（而非 6543 pooler），因为 schema introspection 需要会话级连接。
 *
 * DATABASE_URL 来自 Supabase 的连接串（PostgreSQL 标准 URI 格式）。
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase pooler 证书链不被 Node 默认信任。
  // 开发环境用 tlsSecurity: 'insecure' 跳过证书校验（生产环境应配置正确 CA）。
  // ssl: "require",
  // tlsSecurity: "insecure",
  verbose: true,
});

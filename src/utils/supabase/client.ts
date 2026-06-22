import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase Client。
 *
 * 在 Client Component 里使用（登录表单、登出按钮、监听登录状态）。
 * 自动管理 document.cookie，无需手动处理 session。
 *
 * NEXT_PUBLIC_ 前缀的环境变量会被打包进客户端，anon key 是公开的，
 * 安全由 RLS（行级安全）策略保证。
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

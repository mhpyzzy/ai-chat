import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 服务端 Supabase Client。
 *
 * 在 Server Component / Route Handler / Server Action 里使用。
 * 通过 next/headers 的 cookies() 读取请求里的 session cookie，
 * 实现服务端鉴权。
 *
 * 每次调用都创建新实例（每个请求独立），不要做成模块级单例。
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
         } catch {
            // setAll 在 Server Component 里会失败（只读上下文）。
            // proxy 层的 updateSession 已经处理了 cookie 写入，这里忽略即可。
         }
        },
      },
    },
  );
}

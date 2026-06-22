import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 更新 Supabase session 的辅助函数。
 *
 * Supabase 的 access_token 有效期较短（默认 1 小时），需要定期刷新。
 * 这个函数在 proxy（Next.js 16 的 middleware）里对每个请求调用一次，
 * 把刷新后的 token 写回 cookie，保证 session 不过期。
 *
 * 关键点：proxy 只做"乐观检查"（读 cookie 判断是否登录做跳转），
 * 真正的授权验证在 Route Handler / Server Component 里用 getUser() 做。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // 刷新 token（不返回 user，这里只做 session 续期）
  await supabase.auth.getUser();

  return response;
}

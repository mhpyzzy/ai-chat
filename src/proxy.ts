import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Next.js 16 Proxy（原 Middleware）。
 *
 * 唯一职责：刷新 Supabase session（把新的 access_token 写回 cookie）。
 * 不在这里做路由守卫/重定向——那是授权逻辑，应该在数据层做。
 * proxy 对每个请求（含预取）都会执行，只做轻量的 session 续期。
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// 排除静态资源和 API 路由，减少不必要的 session 刷新开销
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

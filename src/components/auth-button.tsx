"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 导航栏右侧的登录/登出按钮。
 *
 * 用 onAuthStateChange 监听登录状态变化，实时更新 UI：
 *   - 未登录：显示「登录」按钮
 *   - 已登录：显示邮箱 + 登出图标按钮
 */
export function AuthButton() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser({ email: user.email ?? "" });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email ?? "" } : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!user) {
    return (
      <Link
        href="/login"
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
      >
        登录
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {user.email}
      </span>
      <button
        type="button"
        className={cn(buttonVariants({ size: "icon", variant: "ghost" }))}
        onClick={async () => {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
          router.refresh();
        }}
        aria-label="登出"
      >
        <LogOutIcon className="size-4" />
      </button>
    </div>
  );
}

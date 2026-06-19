"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  BookOpenIcon,
  MessageSquareIcon,
  SparklesIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// 导航项：每个对应一个核心能力（学习进度的映射）
const NAV_ITEMS: NavItem[] = [
  { href: "/chat", label: "对话", icon: MessageSquareIcon },
  { href: "/knowledge", label: "知识库", icon: BookOpenIcon },
  { href: "/analyze", label: "评价分析", icon: SparklesIcon },
  { href: "/workflow", label: "工作流", icon: WorkflowIcon },
];

const isActive = (pathname: string, href: string) =>
  href === "/chat" ? pathname === "/chat" : pathname.startsWith(href);

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 h-14 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="mx-auto flex h-full w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <SparklesIcon className="size-5 text-primary" />
          <span>AI Agent Lab</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({ size: "sm", variant: active ? "secondary" : "ghost" }),
                  "gap-1.5",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query 全局 Provider。
 *
 * 为什么用 useState 创建 QueryClient 而不是模块级单例？
 * Next.js App Router 下，模块级单例会在所有请求间共享同一个 cache，
 * 导致用户 A 的数据串到用户 B 的请求里（数据泄露）。用 useState 保证
 * 每个组件实例（即每个请求的 React 树）拿到独立的 QueryClient。
 *
 * staleTime 设 30s：知识库列表 30 秒内不重复请求。
 * 默认 0 会让每次组件 mount 都后台 refetch，对管理后台偏激进。
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

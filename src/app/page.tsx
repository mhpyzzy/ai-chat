import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRightIcon,
  BookOpenIcon,
  BrainIcon,
  MessageSquareIcon,
  SparklesIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 首页不是营销页，而是应用能力总览：让访客一眼看到这个项目实现了什么。
// 每个卡片 = 一项核心 Agent 能力 + 对应的业务场景 + 技术标签 + 跳转入口。

type Capability = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tags: string[];
};

const CAPABILITIES: Capability[] = [
  {
    href: "/chat",
    title: "Agent 对话",
    description: "多工具协作的智能助手，支持天气、计算、时间和知识库检索。对话越长，记忆面板越直观。",
    icon: MessageSquareIcon,
    tags: ["Tool Calling", "Streaming", "Memory"],
  },
  {
    href: "/knowledge",
    title: "RAG 知识库",
    description: "上传文档自动切分、Embedding 入库。对话中 Agent 自主检索并标注引用来源。",
    icon: BookOpenIcon,
    tags: ["Agentic RAG", "Embedding", "向量检索"],
  },
  {
    href: "/analyze",
    title: "评价分析",
    description: "输入用户评价，自动分析情感、打标签、排优先级并生成回复建议，输出结构化数据。",
    icon: SparklesIcon,
    tags: ["Structured Output", "Zod", "类型安全"],
  },
  {
    href: "/workflow",
    title: "内容创作工作流",
    description: "三个 Agent 协作完成内容创作：规划拆解需求、研究检索知识库、写作生成成品。每步进度实时可见。",
    icon: WorkflowIcon,
    tags: ["Multi-Agent", "Workflow", "SSE 流式"],
  },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      {/* 标题区：一句话说清项目是什么 */}
      <section className="mb-12">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <SparklesIcon className="size-8 text-primary" />
          AI Agent Lab
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          基于 Vercel AI SDK 的 Agent 应用，完整实现 Tool Calling、RAG、Structured Output、Memory 四大核心能力。
        </p>
      </section>

      {/* 能力卡片：四大核心能力（记忆是贯穿对话的，所以单独强调） */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map(({ href, title, description, icon: Icon, tags }) => (
          <Link
            key={href}
            href={href}
            className="group relative"
          >
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-5 text-primary" />
                  {title}
                  <ArrowRightIcon className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      {/* 记忆能力单独说明：它贯穿对话，不是独立页面 */}
      <section className="mt-4">
        <Card className="bg-muted/30">
          <CardContent className="flex items-start gap-3 py-4">
            <BrainIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Memory 记忆管理</p>
              <p className="text-sm text-muted-foreground">
                对话越长越明显：短期裁剪剥离旧工具结果省 token，长期摘要压缩超长对话。进入对话页可以看到实时记忆面板。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 快速开始：引导访客从对话体验 */}
      <section className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href="/chat"
          className={cn(buttonVariants({ size: "lg" }), "gap-1.5")}
        >
          开始体验
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          href="/knowledge"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          管理知识库
        </Link>
      </section>
    </div>
  );
}

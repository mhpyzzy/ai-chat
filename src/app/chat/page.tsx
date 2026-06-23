"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import { isToolUIPart } from "ai";

import {
  BrainIcon,
  CalculatorIcon,
  ClockIcon,
  LockIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { SUMMARY_THRESHOLD } from "@/lib/memory";

// 后端通过 data-memory part 发来的记忆诊断（见 route.ts）
type MemoryDiagnostic = {
  originalCount: number;
  finalCount: number;
  summarized: boolean;
};

// 欢迎页推荐问题：点击即发送，让用户一键体验核心能力
const SUGGESTIONS = [
  {
    icon: SparklesIcon,
    title: "知识库问答",
    description: "检索内部文档，给出带来源引用的回答",
    prompt: "公司有哪些产品？",
  },
  {
    icon: CalculatorIcon,
    title: "工具调用",
    description: "让 Agent 调用计算器等工具完成复杂任务",
    prompt: "(100 + 200) * 0.8 是多少？",
  },
  {
    icon: BrainIcon,
    title: "记忆能力",
    description: "告诉助手你的偏好，它会跨会话记住",
    prompt: "请记住：我是前端工程师，正在转 AI Agent 方向",
  },
  {
    icon: ClockIcon,
    title: "实时信息",
    description: "查询当前时间和天气等实时数据",
    prompt: "现在几点了？",
  },
] as const;

export default function Chat() {
  const [diagnostic, setDiagnostic] = useState<MemoryDiagnostic | null>(null);
  // 登录状态：用 onAuthStateChange 监听，未登录时禁用输入并提示
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const { messages, sendMessage, status } = useChat({
    // onData 接收后端 writer.write 发来的自定义 data part。
    // 这里用它接收 data-memory，让记忆系统的处理过程在 UI 上可见。
    onData: (part) => {
      if (part.type === "data-memory") {
        setDiagnostic(part.data as MemoryDiagnostic);
      }
    },
  });

  // 监听 Supabase 登录状态（和 AuthButton 同一套机制）
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ? { email: user.email ?? "" } : null);
      setAuthChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email ?? "" } : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 调试用：观察 message parts 结构，理解 tool part 长什么样
  useEffect(() => {
    console.log("------", messages);
  }, [messages]);

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      sendMessage({ text: message.text });
    }
  };

  const isLoggedIn = authChecked && !!user;
  const isEmpty = messages.length === 0;
  const isStreaming = status === "streaming";

  // 点击推荐问题，直接发送
  const handleSuggestion = (prompt: string) => {
    if (isLoggedIn && status === "ready") {
      sendMessage({ text: prompt });
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-4 py-4 sm:px-6">
      {diagnostic ? (
        <MemoryStatusPanel
          messageCount={messages.length}
          diagnostic={diagnostic}
        />
      ) : null}
      <Conversation className="relative flex-1">
        <ConversationContent>
          {isEmpty ? (
            <WelcomeScreen
              isLoggedIn={isLoggedIn}
              onSelect={handleSuggestion}
            />
          ) : (
            messages.map(({ role, parts }, index) => (
              <Message key={index} from={role}>
                <MessageContent>
                  {parts.map((part, i) => {
                    // 文本片段：正常渲染流式 markdown
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${role}-${i}`}>
                          {part.text}
                        </MessageResponse>
                      );
                    }

                    // 工具调用片段：用 isToolUIPart 通用判断，
                    // 以后新增工具不用改前端，所有工具走同一套渲染。
                    // 另一种写法是 case "tool-getWeather" 按工具名单独渲染。
                    if (isToolUIPart(part)) {
                      return (
                        <Tool key={part.toolCallId} defaultOpen>
                          {/* typed tool 的名称从 type 字段提取（如 "tool-getWeather"）；
                              只有 dynamic-tool 才需要单独传 toolName 字段 */}
                          {part.type === "dynamic-tool" ? (
                            <ToolHeader
                              type="dynamic-tool"
                              state={part.state}
                              toolName={part.toolName}
                            />
                          ) : (
                            <ToolHeader type={part.type} state={part.state} />
                          )}
                          <ToolContent>
                            <ToolInput input={part.input} />
                            {/* ToolOutput 自己处理 object（渲染成 JSON CodeBlock）、
                                string、error 三种情况；无输出时返回 null */}
                            <ToolOutput
                              output={"output" in part ? part.output : undefined}
                              errorText={
                                part.state === "output-error"
                                  ? part.errorText
                                  : undefined
                              }
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }

                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {isLoggedIn ? (
        <PromptInput onSubmit={handleSubmit} className="w-full">
          <PromptInputTextarea placeholder="输入消息，或点击上方推荐问题开始对话…" />
          <PromptInputSubmit
            status={isStreaming ? "streaming" : "ready"}
            disabled={isStreaming}
          />
        </PromptInput>
      ) : (
        <LoginPrompt />
      )}
    </div>
  );
}

// 欢迎屏：居中展示助手介绍 + 推荐问题卡片。
// 参考 ChatGPT / Claude 的空状态设计：让用户一眼知道"能问什么"。
function WelcomeScreen({
  isLoggedIn,
  onSelect,
}: {
  isLoggedIn: boolean;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
      {/* 助手标识 */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <SparklesIcon className="size-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">AI 知识库助手</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            具备知识库检索、工具调用和长期记忆能力的企业 Agent
          </p>
        </div>
      </div>

      {/* 推荐问题：点击即发送，一键体验核心能力 */}
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, title, description, prompt }) => (
          <button
            key={title}
            type="button"
            disabled={!isLoggedIn}
            onClick={() => onSelect(prompt)}
            className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-primary/10">
              <Icon className="size-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// 未登录时的输入区替代：锁图标 + 提示 + 登录按钮。
// 用 buttonVariants + 原生 Link 保持和 AuthButton 一致的样式（Button 组件不支持 asChild）。
function LoginPrompt() {
  return (
    <div className="mx-auto flex w-full items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
      <LockIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">登录后即可开始对话</span>
      <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
        前往登录
      </Link>
    </div>
  );
}

// 记忆状态面板：让 Agent 的记忆管理"可见"。
// 显示：当前对话消息数、距摘要阈值的进度、本次请求记忆系统的处理（原始→处理后、是否摘要）。
function MemoryStatusPanel({
  messageCount,
  diagnostic,
}: {
  messageCount: number;
  diagnostic: MemoryDiagnostic;
}) {
  // 进度 = 当前消息数 / 摘要阈值，超过阈值说明会触发摘要压缩
  const progress = Math.min(messageCount / SUMMARY_THRESHOLD, 1);
  // 接近阈值（>80%）时提示用户即将触发摘要
  const nearThreshold = progress > 0.8;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <BrainIcon className="size-3.5 text-primary" />
        记忆
      </span>

      {/* 对话进度条：当前消息数 vs 摘要阈值 */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              nearThreshold ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span>
          {messageCount} / {SUMMARY_THRESHOLD} 条
        </span>
      </div>

      {/* 本次请求的记忆处理：原始消息数 → 处理后消息数 */}
      <span className="flex items-center gap-1.5">
        本次发送：
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {diagnostic.originalCount} 条
        </Badge>
        <span className="text-muted-foreground/60">→</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {diagnostic.finalCount} 条
        </Badge>
      </span>

      {/* 是否触发摘要 */}
      {diagnostic.summarized ? (
        <Badge className="gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">
          <SparklesIcon className="size-3" />
          已触发摘要
        </Badge>
      ) : (
        <span className="text-muted-foreground/70">
          {nearThreshold ? "接近摘要阈值" : "正常"}
        </span>
      )}
    </div>
  );
}

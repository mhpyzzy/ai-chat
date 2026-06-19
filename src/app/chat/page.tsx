"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import { isToolUIPart } from "ai";

import { BrainIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";
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
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { SUMMARY_THRESHOLD } from "@/lib/memory";

// 后端通过 data-memory part 发来的记忆诊断（见 route.ts）
type MemoryDiagnostic = {
  originalCount: number;
  finalCount: number;
  summarized: boolean;
};

export default function Chat() {
  const [diagnostic, setDiagnostic] = useState<MemoryDiagnostic | null>(null);
  const { messages, sendMessage, status } = useChat({
    // onData 接收后端 writer.write 发来的自定义 data part。
    // 这里用它接收 data-memory，让记忆系统的处理过程在 UI 上可见。
    onData: (part) => {
      if (part.type === "data-memory") {
        setDiagnostic(part.data as MemoryDiagnostic);
      }
    },
  });

  // 调试用：观察 message parts 结构，理解 tool part 长什么样
  useEffect(() => {
    console.log("------", messages);
  }, [messages]);

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      sendMessage({ text: message.text });
    }
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col gap-4 px-4 py-6 sm:px-6">
      {diagnostic ? (
        <MemoryStatusPanel
          messageCount={messages.length}
          diagnostic={diagnostic}
        />
      ) : null}
      <Conversation className="relative flex-1 ">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              description="Messages will appear here as the conversation progresses."
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
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
      <PromptInput onSubmit={handleSubmit} className="mx-auto w-full">
        <PromptInputTextarea placeholder="输入消息，例如：北京天气怎么样？现在几点？(100+200)*0.8 是多少？" />
        <PromptInputSubmit
          status={status === "streaming" ? "streaming" : "ready"}
          disabled={status === "streaming"}
        />
      </PromptInput>
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

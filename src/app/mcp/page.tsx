"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { CableIcon, MessageSquareIcon, NetworkIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";

// MCP 架构说明：这个页面的工具不在本地代码里，而是来自独立进程的 MCP Server。
// Client (/api/mcp-chat) → stdio → Server (src/mcp/server.ts) → 检索知识库。
// 页面 UI 复用 ai-elements，但工具来源完全不同。

export default function McpPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/mcp-chat" }),
  });

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      sendMessage({ text: message.text });
    }
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col gap-4 px-4 py-6 sm:px-6">
      {/* 架构提示条：让用户知道这里的工具来自 MCP Server */}
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <NetworkIcon className="size-3.5 shrink-0 text-primary" />
        <span>工具来源：MCP Server（独立进程）</span>
        <Badge variant="secondary" className="text-[10px] font-normal">stdio 传输</Badge>
        <Badge variant="outline" className="text-[10px] font-normal">Client → Server → 知识库</Badge>
      </div>

      <Conversation className="relative flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              description="这里的工具来自独立的 MCP Server，不是本地代码。试试问知识库相关的问题。"
              icon={<CableIcon className="size-6" />}
              title="MCP 对话"
            />
          ) : (
            messages.map(({ role, parts }, index) => (
              <Message key={index} from={role}>
                <MessageContent>
                  {parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${role}-${i}`}>
                          {part.text}
                        </MessageResponse>
                      );
                    }

                    // MCP 工具调用用统一的 isToolUIPart 判断渲染
                    if (isToolUIPart(part)) {
                      return (
                        <Tool key={part.toolCallId}>
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
        <PromptInputTextarea placeholder="试试问：知识库里有哪些文档？退换货政策是什么？" />
        <PromptInputSubmit
          status={status === "streaming" ? "streaming" : "ready"}
          disabled={status === "streaming"}
        />
      </PromptInput>
    </div>
  );
}

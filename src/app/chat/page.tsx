"use client";

import { useChat } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { useEffect } from "react";

import { MessageSquareIcon } from "lucide-react";
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

export default function Chat() {
  const { messages, sendMessage, status } = useChat();

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

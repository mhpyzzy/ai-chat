"use client";
import { useChat } from "@ai-sdk/react";
import { useState,useEffect } from 'react';

import { MessageSquareIcon } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
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
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat();
  useEffect(() => {
    console.log('------',messages)
  }, [messages]);
  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      sendMessage({ text: message.text });
      setInput("");
    }
  };
  return (
    <div className="flex h-screen flex-col py-20 px-10">
      <Conversation className="relative flex-1">
        <ConversationContent>
          { messages.length === 0 ? (
            <ConversationEmptyState
              description="Messages will appear here as the conversation progresses."
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
            />
          ):(
            messages.map(({ role, parts }, index) => (
              <Message key={index} from={role}>
                <MessageContent>
                  {parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <MessageResponse key={`${role}-${i}`}>
                            {part.text}
                          </MessageResponse>
                        );
                    }
                  })}
                </MessageContent>
              </Message>
            ))
          )
        }
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <PromptInput onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder="输入消息..."
        />
        <PromptInputSubmit
          status={status === "streaming" ? "streaming" : "ready"}
          disabled={!input.trim() || status === "streaming"}
        />
      </PromptInput>  
    </div>
  );
}

import { deepseek } from "@ai-sdk/deepseek";
import { streamText, UIMessage, convertToModelMessages } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: deepseek("deepseek-chat"),
    messages: await convertToModelMessages(messages),
  });

  // useChat 客户端需要 UIMessage 流，而不是纯文本流
  return result.toUIMessageStreamResponse();
}

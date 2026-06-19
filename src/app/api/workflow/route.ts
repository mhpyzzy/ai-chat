import { NextResponse } from "next/server";
import { z } from "zod";
import { runContentWorkflow } from "@/lib/agents";

/**
 * 工作流 API —— 用 SSE（Server-Sent Events）流式推送每个 Agent 的进度。
 *
 * 为什么用 SSE 而不是普通 JSON：
 *   工作流有 3 步（规划、研究、写作），总耗时 10-30 秒。
 *   用 SSE 把每步结果实时推给前端，用户能看到「规划完成 → 研究中 → 写作中」的实时过程，
 *   而不是干等 20 秒才看到结果。这也是多 Agent 工作流在产品上的核心体验。
 */

// 工作流涉及 3 次 LLM 调用 + 多次检索，给足时间
export const maxDuration = 60;

const requestSchema = z.object({
  requirement: z.string().min(5, "需求描述至少 5 个字").max(500),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数校验失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await runContentWorkflow(parsed.data.requirement, send);
      } catch (err) {
        console.error("[workflow] 工作流执行失败:", err);
        send({
          step: "error",
          message: err instanceof Error ? err.message : "工作流执行失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

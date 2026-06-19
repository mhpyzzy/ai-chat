import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestDocument } from "@/lib/rag";
import { countChunks, deleteDocument, listDocuments } from "@/lib/vector-store";

/**
 * 知识库管理 API。
 * GET    列出已入库的文档 + 知识库总规模
 * POST   上传新文档：标题 + 正文 → 切分 → embedding → 入库
 * DELETE 按标题删除某个文档的所有 chunk
 */

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export async function GET() {
  const [documents, totalChunks] = await Promise.all([
    listDocuments(),
    countChunks(),
  ]);
  return NextResponse.json({ documents, totalChunks });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数校验失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { chunkCount } = await ingestDocument(parsed.data.title, parsed.data.content);
    if (chunkCount === 0) {
      return NextResponse.json({ error: "文档内容为空，未生成任何片段" }, { status: 422 });
    }
    return NextResponse.json({ title: parsed.data.title, chunkCount });
  } catch (err) {
    console.error("[knowledge] 上传失败:", err);
    return NextResponse.json({ error: "文档入库失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { title } = await req.json();
  if (typeof title !== "string" || title.length === 0) {
    return NextResponse.json({ error: "缺少 title 参数" }, { status: 400 });
  }
  const removed = await deleteDocument(title);
  return NextResponse.json({ title, removed });
}

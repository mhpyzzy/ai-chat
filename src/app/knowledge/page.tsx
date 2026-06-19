"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertCircleIcon, CheckCircle2Icon, FileTextIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface KnowledgeDoc {
  title: string;
  chunkCount: number;
  createdAt: number;
}

interface UploadResult {
  ok: boolean;
  message: string;
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [deletingTitle, setDeletingTitle] = useState<string | null>(null);

  // 表单状态：两个输入框用原生受控组件即可，避免 zod 4 与 resolvers 的版本冲突
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});

  const refreshDocs = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/knowledge");
      const data = await res.json();
      setDocs(data.documents ?? []);
      setTotalChunks(data.totalChunks ?? 0);
    } catch {
      // 静默失败，列表保持上次状态
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDocs();
  }, [refreshDocs]);

  const validate = (): boolean => {
    const next: { title?: string; content?: string } = {};
    if (title.trim().length === 0) next.title = "请填写文档标题";
    else if (title.length > 200) next.title = "标题最长 200 字";
    if (content.trim().length < 10) next.content = "内容至少 10 个字符";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadResult(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadResult({ ok: false, message: data.error ?? "上传失败" });
        return;
      }
      setUploadResult({
        ok: true,
        message: `已入库：《${data.title}》，切分为 ${data.chunkCount} 个片段`,
      });
      setTitle("");
      setContent("");
      await refreshDocs();
    } catch {
      setUploadResult({ ok: false, message: "网络错误，请稍后重试" });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (docTitle: string) => {
    setDeletingTitle(docTitle);
    try {
      await fetch("/api/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: docTitle }),
      });
      await refreshDocs();
    } finally {
      setDeletingTitle(null);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">知识库管理</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          上传文档后会自动切分、生成向量并入库，供 Agent 检索增强问答（RAG）。共 {totalChunks} 个片段。
        </p>
      </header>

      <form onSubmit={onSubmit} className="mb-8 space-y-4 rounded-lg border p-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="title">
            文档标题
          </label>
          <Input
            id="title"
            placeholder="例如：退换货政策"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title && <p className="text-destructive text-xs">{errors.title}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="content">
            文档内容（支持纯文本 / Markdown）
          </label>
          <Textarea
            id="content"
            rows={8}
            className="font-mono"
            placeholder={"粘贴文档正文，例如：\n\n## 退货政策\n自签收之日起 7 天内可无理由退货..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {errors.content && <p className="text-destructive text-xs">{errors.content}</p>}
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <>
              <Loader2Icon className="animate-spin" /> 正在切分并生成向量...
            </>
          ) : (
            "上传入库"
          )}
        </Button>
      </form>

      {uploadResult && (
        <Alert variant={uploadResult.ok ? "default" : "destructive"} className="mb-8">
          {uploadResult.ok ? (
            <CheckCircle2Icon className="size-4" />
          ) : (
            <AlertCircleIcon className="size-4" />
          )}
          <AlertTitle>{uploadResult.ok ? "上传成功" : "上传失败"}</AlertTitle>
          <AlertDescription>{uploadResult.message}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          已入库文档（{docs.length}）
        </h2>
        {listLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" /> 加载中...
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground text-sm">
            <FileTextIcon className="size-6" />
            还没有文档，先上传一个试试吧
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.title}
                className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {doc.chunkCount} 个片段 · {new Date(doc.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deletingTitle === doc.title}
                  onClick={() => onDelete(doc.title)}
                  aria-label={`删除 ${doc.title}`}
                >
                  {deletingTitle === doc.title ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

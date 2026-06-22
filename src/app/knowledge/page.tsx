"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// 查询缓存 key：所有知识库列表相关操作用这个 key 做失效
const DOCS_QUERY_KEY = ["knowledge", "documents"] as const;

export default function KnowledgePage() {
  const queryClient = useQueryClient();

  // 列表查询：替代原来的 useCallback + useEffect + 手写 loading
  // 自动获得：loading/error 状态、缓存、请求去重、windowFocus 重拉
  const { data, isLoading, isError, error } = useQuery({
    queryKey: DOCS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error("加载失败");
      return (await res.json()) as {
        documents: KnowledgeDoc[];
        totalChunks: number;
      };
    },
  });

  const docs = data?.documents ?? [];
  const totalChunks = data?.totalChunks ?? 0;

  // 上传 mutation：成功后 invalidate 列表缓存，自动 refetch
  // 替代原来 onSubmit 里手写的 setSubmitting + setUploadResult + refreshDocs
  const uploadMutation = useMutation({
    mutationFn: async (input: { title: string; content: string }) => {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "上传失败");
      return { title: input.title, chunkCount: json.chunkCount as number };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      setUploadResult({
        ok: true,
        message: `已入库：《${result.title}》，切分为 ${result.chunkCount} 个片段`,
      });
    },
    onError: (err: Error) => {
      setUploadResult({ ok: false, message: err.message });
    },
  });

  // 删除 mutation：onMutate 里先从缓存移除该文档（乐观更新），
  // 失败时 TanStack Query 自动回滚到 onMutate 返回的 previous。
  const deleteMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("删除失败");
      return { title };
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: DOCS_QUERY_KEY });
      const previous = queryClient.getQueryData<{
        documents: KnowledgeDoc[];
        totalChunks: number;
      }>(DOCS_QUERY_KEY);
      if (previous) {
        const removed = previous.documents.find((d) => d.title === title);
        queryClient.setQueryData(DOCS_QUERY_KEY, {
          ...previous,
          documents: previous.documents.filter((d) => d.title !== title),
          totalChunks: previous.totalChunks - (removed?.chunkCount ?? 0),
        });
      }
      return { previous };
    },
    onError: (_err, _title, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(DOCS_QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
    },
  });

  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // 表单状态：两个输入框用原生受控组件即可，避免 zod 4 与 resolvers 的版本冲突
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});

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
    uploadMutation.mutate(
      { title: title.trim(), content },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
        },
        onSettled: () => setSubmitting(false),
      },
    );
  };

  const onDelete = (docTitle: string) => {
    deleteMutation.mutate(docTitle);
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
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" /> 加载中...
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 py-10 text-destructive text-sm">
            <AlertCircleIcon className="size-6" />
            {(error as Error)?.message ?? "加载失败，请刷新重试"}
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
                  disabled={
                    deleteMutation.isPending &&
                    deleteMutation.variables === doc.title
                  }
                  onClick={() => onDelete(doc.title)}
                  aria-label={`删除 ${doc.title}`}
                >
                  {deleteMutation.isPending &&
                  deleteMutation.variables === doc.title ? (
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

"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import {
  CheckIcon,
  ClipboardListIcon,
  FileSearchIcon,
  LightbulbIcon,
  PenLineIcon,
  WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ContentPlan,
  ResearchResult,
  WorkflowProgress,
  WritingResult,
} from "@/lib/agents";

type StepName = "plan" | "research" | "write";
type StepStatus = "pending" | "running" | "done";

interface WorkflowState {
  plan: ContentPlan | null;
  research: ResearchResult | null;
  writing: WritingResult | null;
  stepStatus: Record<StepName, StepStatus>;
  error: string | null;
}

const INITIAL_STATE: WorkflowState = {
  plan: null,
  research: null,
  writing: null,
  stepStatus: { plan: "pending", research: "pending", write: "pending" },
  error: null,
};

// 示例需求：前两个对齐知识库内容，能触发 RAG 检索效果
const SAMPLE_REQUIREMENTS = [
  "写一篇电商退换货政策的用户指南，面向新用户，语气亲切",
  "撰写配送与物流服务的 FAQ，解答常见问题",
  "写一篇介绍智能客服系统优势的文章，面向企业决策者",
];

const STEP_META: Record<
  StepName,
  { label: string; icon: typeof ClipboardListIcon; role: string }
> = {
  plan: { label: "规划 Agent", icon: ClipboardListIcon, role: "拆解需求 · 制定大纲" },
  research: { label: "研究 Agent", icon: FileSearchIcon, role: "检索知识库 · 收集事实" },
  write: { label: "写作 Agent", icon: PenLineIcon, role: "汇总资料 · 生成内容" },
};

const STEP_ORDER: StepName[] = ["plan", "research", "write"];

export default function WorkflowPage() {
  const [requirement, setRequirement] = useState("");
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<WorkflowState>(INITIAL_STATE);

  const runWorkflow = useCallback(async () => {
    if (!requirement.trim() || running) return;
    setRunning(true);
    setState(INITIAL_STATE);

    try {
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement }),
      });
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      if (!res.body) throw new Error("未收到响应流");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 手动解析 SSE：按 \n\n 分隔事件，每个事件以 "data: " 开头
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;
          const progress: WorkflowProgress = JSON.parse(line.slice(6));
          handleProgress(progress, setState);
        }
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : "工作流执行失败",
      }));
    } finally {
      setRunning(false);
    }
  }, [requirement, running]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <WorkflowIcon className="size-6 text-primary" />
          内容创作工作流
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          多个 Agent 协作完成内容创作：规划拆解需求 → 研究检索知识库 → 写作生成成品。每一步实时可见。
        </p>
      </div>

      {/* 输入区 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Textarea
            value={requirement}
            onChange={(e) => setRequirement(e.currentTarget.value)}
            placeholder="描述你想创作的内容，例如「写一篇退换货政策的用户指南」..."
            className="min-h-24 resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={runWorkflow} disabled={!requirement.trim() || running}>
              {running ? <Spinner className="size-4" /> : null}
              {running ? "执行中" : "启动工作流"}
            </Button>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_REQUIREMENTS.map((text, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setRequirement(text)}
                >
                  示例 {i + 1}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {state.error ? (
        <Card className="mb-6 border-rose-200 bg-rose-50">
          <CardContent className="py-4 text-sm text-rose-700">
            {state.error}
          </CardContent>
        </Card>
      ) : null}

      {/* 工作流时间线 */}
      {STEP_ORDER.some((s) => state.stepStatus[s] !== "pending") ? (
        <div className="space-y-0">
          {STEP_ORDER.map((step, i) => {
            const status = state.stepStatus[step];
            const isLast = i === STEP_ORDER.length - 1;
            const meta = STEP_META[step];
            return (
              <WorkflowStep
                key={step}
                step={step}
                status={status}
                label={meta.label}
                role={meta.role}
                icon={meta.icon}
                isLast={isLast}
                state={state}
              />
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <LightbulbIcon className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              输入创作需求，点击启动工作流，观察三个 Agent 如何协作。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** 处理 SSE 进度事件，更新对应步骤状态 */
function handleProgress(
  progress: WorkflowProgress,
  setState: React.Dispatch<React.SetStateAction<WorkflowState>>,
) {
  switch (progress.step) {
    case "plan":
      if (progress.status === "running") {
        setState((s) => ({ ...s, stepStatus: { ...s.stepStatus, plan: "running" } }));
      } else {
        setState((s) => ({
          ...s,
          plan: progress.result,
          stepStatus: { ...s.stepStatus, plan: "done", research: "running" },
        }));
      }
      break;
    case "research":
      if (progress.status === "running") {
        setState((s) => ({ ...s, stepStatus: { ...s.stepStatus, research: "running" } }));
      } else {
        setState((s) => ({
          ...s,
          research: progress.result,
          stepStatus: { ...s.stepStatus, research: "done", write: "running" },
        }));
      }
      break;
    case "write":
      if (progress.status === "running") {
        setState((s) => ({ ...s, stepStatus: { ...s.stepStatus, write: "running" } }));
      } else {
        setState((s) => ({
          ...s,
          writing: progress.result,
          stepStatus: { ...s.stepStatus, write: "done" },
        }));
      }
      break;
    case "error":
      setState((s) => ({ ...s, error: progress.message }));
      break;
    case "complete":
      break;
  }
}

// ============ 单个步骤组件 ============

interface WorkflowStepProps {
  step: StepName;
  status: StepStatus;
  label: string;
  role: string;
  icon: typeof ClipboardListIcon;
  isLast: boolean;
  state: WorkflowState;
}

function WorkflowStep({
  step,
  status,
  label,
  role,
  icon: Icon,
  isLast,
  state,
}: WorkflowStepProps) {
  return (
    <div className="flex gap-4">
      {/* 左侧状态指示器 + 连接线 */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            status === "done" && "border-primary bg-primary text-primary-foreground",
            status === "running" && "border-primary bg-primary/10 text-primary",
            status === "pending" && "border-muted bg-background text-muted-foreground",
          )}
        >
          {status === "done" ? (
            <CheckIcon className="size-5" />
          ) : status === "running" ? (
            <Spinner className="size-5 text-primary" />
          ) : (
            <Icon className="size-5" />
          )}
        </div>
        {!isLast ? (
          <div
            className={cn(
              "w-0.5 flex-1 min-h-8 transition-colors",
              status === "done" ? "bg-primary" : "bg-border",
            )}
          />
        ) : null}
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{role}</span>
          {status === "running" ? (
            <Badge variant="secondary" className="text-[10px]">进行中</Badge>
          ) : null}
        </div>

        {status === "done" ? (
          <StepResult step={step} state={state} />
        ) : status === "running" ? (
          <p className="text-sm text-muted-foreground">正在执行...</p>
        ) : (
          <p className="text-sm text-muted-foreground/60">等待中</p>
        )}
      </div>
    </div>
  );
}

/** 根据 step 渲染对应的结果内容 */
function StepResult({ step, state }: { step: StepName; state: WorkflowState }) {
  if (step === "plan" && state.plan) {
    const plan = state.plan;
    return (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div>
            <p className="text-xs text-muted-foreground">标题</p>
            <p className="text-sm font-medium">{plan.title}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">大纲</p>
            <ol className="ml-4 list-decimal space-y-0.5 text-sm">
              {plan.outline.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[10px]">{plan.tone}</Badge>
            <Badge variant="outline" className="text-[10px]">目标 {plan.wordCount} 字</Badge>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">研究问题</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.researchQueries.map((q, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-normal">{q}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "research" && state.research) {
    const research = state.research;
    return (
      <Card>
        <CardContent className="space-y-3 pt-4">
          {research.findings.map((f, i) => (
            <div key={i}>
              {i > 0 ? <Separator className="my-2" /> : null}
              <p className="text-sm font-medium">{f.query}</p>
              {f.found ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {f.sources.map((s, j) => (
                    <Badge key={j} variant="secondary" className="text-[10px] font-normal">
                      {s.title} · {s.similarity}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground/70">知识库中未找到相关内容</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (step === "write" && state.writing) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{state.writing.charCount} 字</Badge>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {state.writing.content}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

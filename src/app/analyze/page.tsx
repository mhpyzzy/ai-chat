"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  FrownIcon,
  MehIcon,
  SmileIcon,
  SparklesIcon,
} from "lucide-react";
import type { ReviewAnalysis } from "@/lib/schemas/analysis";

// 情感 → 展示配置的映射，集中管理避免散落在 JSX 里
const SENTIMENT_META: Record<
  ReviewAnalysis["sentiment"],
  { label: string; icon: React.ReactNode; tone: string }
> = {
  positive: { label: "好评", icon: <SmileIcon className="size-4" />, tone: "text-emerald-600" },
  neutral: { label: "中评", icon: <MehIcon className="size-4" />, tone: "text-amber-600" },
  negative: { label: "差评", icon: <FrownIcon className="size-4" />, tone: "text-rose-600" },
};

const PRIORITY_LABEL: Record<ReviewAnalysis["priority"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

// 几条示例评价，点击即填入，省去手打
const SAMPLE_REVIEWS = [
  "物流太快了，昨天下单今天就到！包装也很用心，东西质量比预期好，会回购。",
  "等了五天还没发货，客服也不回消息，太失望了。要不是限时就直接退款了。",
  "东西还行吧，能用，就是颜色和图片差挺多，建议实物拍摄。",
];

export default function AnalyzePage() {
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!review.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review }),
      });
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const data: { analysis: ReviewAnalysis } = await res.json();
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setLoading(false);
    }
  }

  const sentimentMeta = analysis ? SENTIMENT_META[analysis.sentiment] : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <SparklesIcon className="size-6 text-primary" />
          评价智能分析
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          输入用户评价，自动分析情感、打标签、排优先级并生成回复建议。
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Textarea
            value={review}
            onChange={(e) => setReview(e.currentTarget.value)}
            placeholder="粘贴一条用户评价..."
            className="min-h-32 resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={handleAnalyze}
              disabled={!review.trim() || loading}
            >
              {loading ? <Spinner className="size-4" /> : null}
              {loading ? "分析中" : "开始分析"}
            </Button>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_REVIEWS.map((text, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setReview(text)}
                >
                  示例 {i + 1}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="py-4 text-sm text-rose-700">{error}</CardContent>
        </Card>
      ) : null}

      {analysis && sentimentMeta ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className={`flex items-center gap-2 ${sentimentMeta.tone}`}>
                  {sentimentMeta.icon}
                  {sentimentMeta.label}
                </span>
                <Badge variant="secondary">
                  满意度 {analysis.score}/10
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">{analysis.summary}</p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">标签</span>
                {analysis.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">优先级</span>
                <Badge
                  variant={analysis.priority === "high" ? "destructive" : "secondary"}
                >
                  {PRIORITY_LABEL[analysis.priority]}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-sm">建议回复</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{analysis.suggestedReply}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

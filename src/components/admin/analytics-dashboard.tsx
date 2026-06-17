"use client";

import { MetricCard } from "@/components/admin/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  AnalyticsPayload,
  BatchAnalytics,
  TimeSeriesPoint,
} from "@/lib/analytics-types";
import {
  exportAnalyticsCsv,
  exportAnalyticsPdf,
} from "@/lib/analytics-export";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface AnalyticsDashboardProps {
  initialBatchId?: string;
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  failed: "Failed",
  permanently_failed: "Permanently failed",
  not_started: "Not started",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500",
  in_progress: "bg-blue-500",
  failed: "bg-red-400",
  permanently_failed: "bg-zinc-800",
  not_started: "bg-zinc-300",
};

function clamp(v: number) {
  return Math.min(100, Math.max(0, v));
}

function BatchComparisonChart({ batches }: { batches: BatchAnalytics[] }) {
  if (batches.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No batch data yet. Assign training to batches to see comparisons.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {batches.map((batch) => (
        <div key={batch.id}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Link
              href={`/admin/analytics/batch/${batch.id}`}
              className="text-sm font-medium text-zinc-800 hover:text-[#2e3192]"
            >
              {batch.label}
            </Link>
            <span className="text-xs tabular-nums text-zinc-500">
              {batch.learnersStarted} started · {batch.completed} passed
            </span>
          </div>
          <div className="space-y-2">
            <MetricBar
              label="Compliance"
              value={clamp(batch.compliance)}
              color="bg-[#2e3192]"
            />
            <MetricBar
              label="Pass rate"
              value={batch.passRate != null ? clamp(batch.passRate) : 0}
              color="bg-emerald-500"
              muted={batch.passRate == null}
            />
            <MetricBar
              label="Avg. score"
              value={batch.avgScore != null ? clamp(batch.avgScore) : 0}
              color="bg-[#f15a24]"
              muted={batch.avgScore == null}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricBar({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: number;
  color: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${muted ? 0 : value}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-700">
        {muted ? "—" : `${value}%`}
      </span>
    </div>
  );
}

function TimeSeriesChart({ points }: { points: TimeSeriesPoint[] }) {
  const chartHeightPx = 144;
  const maxVal = Math.max(
    1,
    ...points.map((p) => p.completions + p.failures),
  );
  const totalCompletions = points.reduce((a, p) => a + p.completions, 0);
  const totalFailures = points.reduce((a, p) => a + p.failures, 0);
  const isEmpty = totalCompletions === 0 && totalFailures === 0;

  const formatDate = (dateKey: string) =>
    new Date(dateKey + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Completions ({totalCompletions})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          Failures ({totalFailures})
        </span>
        <span className="text-zinc-400">Last 30 days</span>
      </div>

      <div
        className="relative rounded-lg border border-zinc-100 bg-gradient-to-b from-zinc-50/80 to-white px-2 pt-3"
        style={{ height: chartHeightPx + 28 }}
      >
        <div
          className="pointer-events-none absolute inset-x-2 top-3 border-b border-dashed border-zinc-200"
          style={{ bottom: 28 }}
        />
        <div
          className="absolute inset-x-2 top-3 flex items-end gap-[2px] sm:gap-1"
          style={{ height: chartHeightPx }}
        >
          {points.map((p) => {
            const total = p.completions + p.failures;
            const barHeight =
              total > 0 ? Math.max(Math.round((total / maxVal) * chartHeightPx), 6) : 0;
            const dateLabel = formatDate(p.date);
            return (
              <div
                key={p.date}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={`${dateLabel}: ${p.completions} completed, ${p.failures} failed`}
              >
                <div
                  className={cn(
                    "flex w-full flex-col-reverse overflow-hidden rounded-t transition-opacity group-hover:opacity-90",
                    total === 0 ? "bg-transparent" : "bg-zinc-100",
                  )}
                  style={{ height: barHeight }}
                >
                  {p.completions > 0 && (
                    <div
                      className="w-full bg-emerald-500"
                      style={{ flex: p.completions }}
                    />
                  )}
                  {p.failures > 0 && (
                    <div
                      className="w-full bg-red-400"
                      style={{ flex: p.failures }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-2 bottom-1 flex gap-[2px] sm:gap-1">
          {points.map((p, i) => {
            const showLabel =
              i === 0 || i === points.length - 1 || (i + 1) % 7 === 0;
            return (
              <div key={`${p.date}-label`} className="flex-1 text-center">
                {showLabel ? (
                  <span className="text-[10px] tabular-nums text-zinc-400">
                    {formatDate(p.date)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {isEmpty && (
        <p className="mt-4 text-center text-sm text-zinc-500">
          No completions or failures in the last 30 days yet.
        </p>
      )}
    </div>
  );
}

function StatusBreakdownChart({
  breakdown,
  total,
}: {
  breakdown: { status: string; count: number }[];
  total: number;
}) {
  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">No assessment activity recorded.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
        {breakdown.map((item) => (
          <div
            key={item.status}
            className={cn(STATUS_COLORS[item.status] ?? "bg-zinc-400")}
            style={{ width: `${(item.count / total) * 100}%` }}
            title={`${STATUS_LABELS[item.status] ?? item.status}: ${item.count}`}
          />
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {breakdown.map((item) => (
          <li key={item.status} className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-zinc-600">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  STATUS_COLORS[item.status] ?? "bg-zinc-400",
                )}
              />
              {STATUS_LABELS[item.status] ?? item.status.replace(/_/g, " ")}
            </span>
            <span className="font-semibold tabular-nums text-zinc-800">
              {item.count}
              <span className="ml-1 text-xs font-normal text-zinc-400">
                ({Math.round((item.count / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type StatusFilter = "all" | "completed" | "failed" | "in_progress";

export function AnalyticsDashboard({ initialBatchId }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [batchFilter, setBatchFilter] = useState<string>(initialBatchId ?? "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 25;

  const load = useCallback(async () => {
    const initialLoad = !data;
    if (initialLoad) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/analytics");
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not load analytics.");
        setData(null);
        return;
      }
      setData(json as AnalyticsPayload);
    } catch {
      setError("Network error loading analytics.");
      if (initialLoad) setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredHistory = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.trim().toLowerCase();
    return data.history.filter((r) => {
      if (batchFilter !== "all" && r.batchId !== batchFilter) return false;
      if (statusFilter === "completed" && r.status !== "completed") return false;
      if (
        statusFilter === "failed" &&
        r.status !== "failed" &&
        r.status !== "permanently_failed"
      )
        return false;
      if (statusFilter === "in_progress" && r.status !== "in_progress") return false;
      if (
        term &&
        !r.userEmail.toLowerCase().includes(term) &&
        !r.moduleTitle.toLowerCase().includes(term) &&
        !r.batchLabel.toLowerCase().includes(term)
      )
        return false;
      return true;
    });
  }, [data, batchFilter, statusFilter, searchTerm]);
  const historyTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredHistory.length / historyPageSize)),
    [filteredHistory.length],
  );
  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredHistory.slice(start, start + historyPageSize);
  }, [filteredHistory, historyPage]);

  const filterPillCount = useMemo(() => {
    let n = 0;
    if (batchFilter !== "all") n++;
    if (statusFilter !== "all") n++;
    if (searchTerm.trim()) n++;
    return n;
  }, [batchFilter, statusFilter, searchTerm]);

  const statusTotal = useMemo(
    () => data?.statusBreakdown.reduce((a, s) => a + s.count, 0) ?? 0,
    [data],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
        Loading analytics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="empty-state mx-auto max-w-md">
        <AlertTriangle className="h-8 w-8 text-amber-500" strokeWidth={1.5} />
        <p className="mt-4 text-sm font-medium text-zinc-700">
          {error || "Analytics unavailable"}
        </p>
        <Button className="mt-4" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* Export hub */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="section-label">Export hub</p>
            <p className="mt-1 text-sm text-zinc-600">
              Download organization-wide compliance data for audits and reviews.
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Last updated {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportAnalyticsCsv(data)}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportAnalyticsPdf(data)}>
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Avg. score"
          value={summary.avgScore != null ? clamp(summary.avgScore) : "—"}
          suffix={summary.avgScore != null ? "%" : undefined}
          icon={TrendingUp}
          accent="brand"
          trend={`Pass threshold: ${PASS_THRESHOLD_PERCENT}%`}
        />
        <MetricCard
          label="Pass rate"
          value={summary.passRate != null ? clamp(summary.passRate) : "—"}
          suffix={summary.passRate != null ? "%" : undefined}
          icon={CheckCircle2}
          accent="success"
          trend="Across all scored attempts"
        />
        <MetricCard
          label="Completed"
          value={summary.completedCount}
          icon={BarChart3}
          accent="success"
          trend={`${summary.failedCount} failed · ${summary.inProgressCount} active`}
        />
        <MetricCard
          label="Total learners"
          value={summary.totalLearners}
          icon={Users}
          accent="muted"
          trend={`${summary.totalBatches} batches · ${summary.publishedModules} modules`}
        />
      </section>

      {/* Charts row */}
      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-900">Cross-batch comparison</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Compliance, pass rate, and average score by training batch.
            </p>
          </CardHeader>
          <CardContent>
            <BatchComparisonChart batches={data.batches} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-900">Completion trends</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Daily completions and failures over the last 30 days.
            </p>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart points={data.timeSeries} />
          </CardContent>
        </Card>
      </section>

      {/* Status + modules */}
      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-900">Status breakdown</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              All assessment attempts by current status.
            </p>
          </CardHeader>
          <CardContent>
            <StatusBreakdownChart breakdown={data.statusBreakdown} total={statusTotal} />
            <div className="mt-5 flex items-center gap-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                {summary.totalWarnings} warnings
              </span>
              <span className="inline-flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" />
                {summary.totalRetakes} retakes
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-900">Assessment performance</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Pass rates and completion counts per published module.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {data.modules.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-zinc-500">
                No module attempts yet. Publish training from the{" "}
                <Link href="/admin/upload" className="font-medium text-[#2e3192] hover:underline">
                  content library
                </Link>
                .
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-6 py-3">Module</th>
                      <th className="px-6 py-3">Attempts</th>
                      <th className="px-6 py-3">Completed</th>
                      <th className="px-6 py-3">Avg. score</th>
                      <th className="px-6 py-3">Pass rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.modules.map((m) => (
                      <tr key={m.moduleId} className="hover:bg-zinc-50/50">
                        <td className="px-6 py-3 font-medium text-zinc-800">{m.moduleTitle}</td>
                        <td className="px-6 py-3 tabular-nums text-zinc-600">{m.attemptCount}</td>
                        <td className="px-6 py-3 tabular-nums text-zinc-600">{m.completedCount}</td>
                        <td className="px-6 py-3 tabular-nums text-zinc-600">
                          {m.avgScore != null ? `${m.avgScore}%` : "—"}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              m.passRate != null && m.passRate > PASS_THRESHOLD_PERCENT
                                ? "bg-emerald-50 text-emerald-700"
                                : m.passRate != null
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-zinc-100 text-zinc-500",
                            )}
                          >
                            {m.passRate != null ? `${m.passRate}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Batch deep dive */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Batch deep dive</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Open a batch for learner marks, scores, and CSV export. Member lists stay under Batches.
              </p>
            </div>
            <Link
              href="/admin/batches"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2e3192] hover:text-[#3d42a8]"
            >
              All batches
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {data.batches.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No batches yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.batches.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/analytics/batch/${b.id}`}
                  className="surface-card-interactive group flex flex-col gap-3 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="section-label">Batch</p>
                      <h3 className="mt-1 truncate text-sm font-semibold text-zinc-900 group-hover:text-[#2e3192]">
                        {b.label}
                      </h3>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                        b.compliance >= 70
                          ? "bg-emerald-50 text-emerald-700"
                          : b.compliance > 0
                            ? "bg-amber-50 text-amber-800"
                            : "bg-zinc-100 text-zinc-500",
                      )}
                    >
                      {b.compliance}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 text-center">
                    <BatchStat label="Members" value={b.memberCount} />
                    <BatchStat
                      label="Started"
                      value={b.learnersStarted}
                      tone={b.learnersStarted > 0 ? "brand" : "muted"}
                    />
                    <BatchStat
                      label="Avg score"
                      value={b.avgScore != null ? `${b.avgScore}%` : "—"}
                      tone={
                        b.avgScore != null && b.avgScore > PASS_THRESHOLD_PERCENT
                          ? "success"
                          : b.avgScore != null
                            ? "warning"
                            : "muted"
                      }
                    />
                  </div>
                  <span className="inline-flex items-center justify-end text-xs font-medium text-[#2e3192]">
                    View marks & export
                    <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical records */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Historical activity</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Recent learner attempts, scores, and completion dates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                <Filter className="h-3 w-3" />
                {filteredHistory.length} of {data.history.length}
                {filterPillCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBatchFilter("all");
                      setStatusFilter("all");
                      setSearchTerm("");
                      setHistoryPage(1);
                    }}
                    className="ml-1 text-zinc-400 hover:text-zinc-700"
                    aria-label="Clear filters"
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          </div>

          {/* Filter pills */}
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                active={statusFilter === "all"}
                onClick={() => {
                  setStatusFilter("all");
                  setHistoryPage(1);
                }}
              >
                All
              </FilterPill>
              <FilterPill
                active={statusFilter === "completed"}
                onClick={() => {
                  setStatusFilter("completed");
                  setHistoryPage(1);
                }}
                tone="success"
              >
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </FilterPill>
              <FilterPill
                active={statusFilter === "failed"}
                onClick={() => {
                  setStatusFilter("failed");
                  setHistoryPage(1);
                }}
                tone="danger"
              >
                <XCircle className="h-3 w-3" />
                Failed
              </FilterPill>
              <FilterPill
                active={statusFilter === "in_progress"}
                onClick={() => {
                  setStatusFilter("in_progress");
                  setHistoryPage(1);
                }}
                tone="brand"
              >
                <Activity className="h-3 w-3" />
                In progress
              </FilterPill>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setHistoryPage(1);
                  }}
                  placeholder="Search learner, module…"
                  className="h-9 w-56 rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
                />
              </div>
              <select
                value={batchFilter}
                onChange={(e) => {
                  setBatchFilter(e.target.value);
                  setHistoryPage(1);
                }}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
              >
                <option value="all">All batches</option>
                {data.batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredHistory.length === 0 ? (
            <div className="empty-state mx-6 my-8 border-dashed py-12">
              <p className="text-sm font-medium text-zinc-600">
                {filterPillCount > 0 ? "No records match your filters" : "No historical records yet"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {filterPillCount > 0
                  ? "Try clearing filters or adjusting your search term."
                  : "Learner scores and completions will appear here after assessments are taken."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-6 py-3">Learner</th>
                    <th className="px-6 py-3">Assessment</th>
                    <th className="px-6 py-3">Batch</th>
                    <th className="px-6 py-3">Score</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {pagedHistory.map((row) => {
                    const displayScore = row.scorePercent;
                    const passed =
                      displayScore != null && displayScore >= PASS_THRESHOLD_PERCENT;
                    return (
                      <tr
                        key={`${row.userEmail}-${row.moduleTitle}-${row.updatedAt}`}
                        className="hover:bg-zinc-50/50"
                      >
                        <td className="select-text px-6 py-3 font-mono text-xs text-zinc-600">
                          {row.userEmail}
                        </td>
                        <td className="px-6 py-3 text-zinc-800">{row.moduleTitle}</td>
                        <td className="px-6 py-3 text-zinc-500">{row.batchLabel}</td>
                        <td className="px-6 py-3">
                          {displayScore != null ? (
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                                passed
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-800",
                              )}
                            >
                              {displayScore}%
                              {row.mcqTotal > 0 && (
                                <span className="ml-1 font-normal opacity-70">
                                  ({Math.min(row.mcqCorrect, row.mcqTotal)}/{row.mcqTotal})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 capitalize text-zinc-600">
                          {row.status.replace(/_/g, " ")}
                        </td>
                        <td className="px-6 py-3 text-xs tabular-nums text-zinc-500">
                          {new Date(row.completedAt ?? row.updatedAt).toLocaleDateString(
                            undefined,
                            { dateStyle: "medium" },
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredHistory.length > 0 && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3">
              <p className="text-xs text-zinc-500">
                Page {historyPage} of {historyTotalPages} ({filteredHistory.length} filtered rows)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= historyTotalPages}
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BatchStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  tone?: "muted" | "brand" | "success" | "warning";
}) {
  const colors = {
    muted: "text-zinc-700",
    brand: "text-[#2e3192]",
    success: "text-emerald-700",
    warning: "text-amber-700",
  };
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", colors[tone])}>
        {value}
      </p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  tone = "neutral",
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "neutral" | "success" | "danger" | "brand";
  children: React.ReactNode;
}) {
  const activeTones = {
    neutral: "bg-zinc-900 text-white border-zinc-900",
    success: "bg-emerald-600 text-white border-emerald-600",
    danger: "bg-red-600 text-white border-red-600",
    brand: "bg-[#2e3192] text-white border-[#2e3192]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? activeTones[tone]
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

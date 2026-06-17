"use client";

import { MetricCard } from "@/components/admin/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { BatchPerformancePayload } from "@/lib/batch-performance-types";
import { exportBatchPerformanceCsv } from "@/lib/batch-performance-export";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { MODULE_KIND_LABELS } from "@/lib/module-kind";
import { resolveDisplayScorePercent } from "@/lib/progress-score";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const MAX_SCORE_RETAKES = 2;

function resolveLastActivity(
  status: string,
  scorePercent: number | null,
  completedAt: string | null,
  updatedAt: string | null,
  lastAccessedAt: string | null,
): string | null {
  if (status === "not_started" && scorePercent == null) return null;
  return completedAt ?? updatedAt ?? lastAccessedAt ?? null;
}

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type CompletionFilter = "all" | "completed" | "incomplete";

function isCompletedStatus(status: string): boolean {
  return status === "completed";
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "border-[#2e3192] bg-[#2e3192] text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  failed: "Failed",
  permanently_failed: "Permanently failed",
  not_started: "Not started",
};

interface BatchPerformancePanelProps {
  data: BatchPerformancePayload;
}

export function BatchPerformancePanel({ data }: BatchPerformancePanelProps) {
  const [search, setSearch] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");

  const flatRows = useMemo(() => {
    const rows: {
      key: string;
      email: string;
      displayName: string;
      moduleTitle: string;
      status: string;
      scorePercent: number | null;
      mcqCorrect: number;
      mcqTotal: number;
      retakeCount: number;
      lastActivity: string | null;
    }[] = [];

    for (const learner of data.learners) {
      if (learner.assessments.length === 0) {
        rows.push({
          key: `${learner.email}-none`,
          email: learner.email,
          displayName: learner.displayName,
          moduleTitle: "—",
          status: "not_started",
          scorePercent: null,
          mcqCorrect: 0,
          mcqTotal: 0,
          retakeCount: 0,
          lastActivity: null,
        });
        continue;
      }
      for (const a of learner.assessments) {
        rows.push({
          key: `${learner.email}-${a.moduleId}`,
          email: learner.email,
          displayName: learner.displayName,
          moduleTitle: a.moduleTitle,
          status: a.status,
          scorePercent: a.scorePercent,
          mcqCorrect: a.mcqCorrect,
          mcqTotal: a.mcqTotal,
          retakeCount: a.retakeCount,
          lastActivity: resolveLastActivity(
            a.status,
            a.scorePercent,
            a.completedAt,
            a.updatedAt,
            a.lastAccessedAt,
          ),
        });
      }
    }
    return rows;
  }, [data.learners]);

  const completionCounts = useMemo(() => {
    let completed = 0;
    let incomplete = 0;
    for (const r of flatRows) {
      if (isCompletedStatus(r.status)) completed++;
      else incomplete++;
    }
    return { completed, incomplete, all: flatRows.length };
  }, [flatRows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return flatRows.filter((r) => {
      if (completionFilter === "completed" && !isCompletedStatus(r.status)) return false;
      if (completionFilter === "incomplete" && isCompletedStatus(r.status)) return false;
      if (!term) return true;
      return (
        r.email.toLowerCase().includes(term) ||
        r.displayName.toLowerCase().includes(term) ||
        r.moduleTitle.toLowerCase().includes(term)
      );
    });
  }, [flatRows, search, completionFilter]);

  const { summary, batch, track } = data;
  const trackLabel = MODULE_KIND_LABELS[track ?? "compliance"];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Members"
          value={String(batch.memberCount)}
          icon={Users}
          trend={`${summary.modulesAssigned} ${trackLabel.toLowerCase()} module${summary.modulesAssigned !== 1 ? "s" : ""} assigned`}
        />
        <MetricCard
          label="Started"
          value={String(summary.learnersStarted)}
          icon={FileSpreadsheet}
          trend="Learners with at least one attempt"
        />
        <MetricCard
          label="Completed"
          value={String(summary.completed)}
          icon={CheckCircle2}
          trend={`${summary.inProgress} in progress`}
        />
        <MetricCard
          label="Avg. score"
          value={summary.avgScore != null ? `${summary.avgScore}%` : "—"}
          icon={Download}
          trend={
            summary.passRate != null
              ? `${summary.passRate}% pass rate · ${summary.compliance}% compliance`
              : "No scored results yet"
          }
        />
      </div>

      <Card>
        <CardHeader className="border-b border-zinc-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-label">Marks & performance</p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900">
                {trackLabel} results by module
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Scores and status for every member in this batch. Member list only is on the{" "}
                <Link href={`/admin/batch/${batch.id}`} className="font-medium text-[#2e3192] hover:underline">
                  Batches
                </Link>{" "}
                tab.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportBatchPerformanceCsv(data)}
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill
                active={completionFilter === "all"}
                onClick={() => setCompletionFilter("all")}
              >
                All ({completionCounts.all})
              </FilterPill>
              <FilterPill
                active={completionFilter === "completed"}
                onClick={() => setCompletionFilter("completed")}
              >
                Completed ({completionCounts.completed})
              </FilterPill>
              <FilterPill
                active={completionFilter === "incomplete"}
                onClick={() => setCompletionFilter("incomplete")}
              >
                Not completed ({completionCounts.incomplete})
              </FilterPill>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or assessment…"
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.modules.length === 0 ? (
            <div className="empty-state mx-6 my-10 border-dashed py-12">
              <p className="text-sm font-medium text-zinc-600">No assessments assigned</p>
              <p className="mt-1 text-xs text-zinc-400">
                {track === "course"
                  ? "Publish a course from Content library → Courses to see marks here."
                  : "Publish compliance training from Content library → Compliance to see marks here."}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state mx-6 my-10 border-dashed py-12">
              <p className="text-sm font-medium text-zinc-600">
                {flatRows.length === 0
                  ? "No learners in this batch yet"
                  : "No rows match your filters"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-6 py-3">Learner</th>
                    <th className="px-6 py-3">Assessment</th>
                    <th className="px-6 py-3">Score</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Retakes</th>
                    <th className="px-6 py-3">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filtered.map((row) => {
                    const displayScore = resolveDisplayScorePercent({
                      status: row.status,
                      storedScorePercent: row.scorePercent,
                      mcqCorrect: row.mcqCorrect,
                      mcqTotal: row.mcqTotal,
                    });
                    const passed =
                      displayScore != null && displayScore >= PASS_THRESHOLD_PERCENT;

                    return (
                      <tr key={row.key} className="hover:bg-zinc-50/50">
                        <td className="px-6 py-3">
                          <p className="text-sm font-semibold text-zinc-900">{row.displayName}</p>
                          <p className="select-text mt-0.5 font-mono text-[11px] text-zinc-500">
                            {row.email}
                          </p>
                        </td>
                        <td className="px-6 py-3 text-zinc-800">{row.moduleTitle}</td>
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
                        <td className="px-6 py-3">
                          <StatusPill status={row.status} />
                        </td>
                        <td className="px-6 py-3 tabular-nums text-zinc-600">
                          {row.retakeCount} / {MAX_SCORE_RETAKES}
                        </td>
                        <td className="px-6 py-3 text-xs tabular-nums text-zinc-500">
                          {row.lastActivity
                            ? formatActivityDate(row.lastActivity)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const styles: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
    in_progress: "bg-blue-50 text-blue-700 ring-blue-200/60",
    failed: "bg-red-50 text-red-700 ring-red-200/60",
    permanently_failed: "bg-zinc-900 text-white ring-zinc-800",
    not_started: "bg-zinc-100 text-zinc-600 ring-zinc-200/60",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1",
        styles[status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200/60",
      )}
    >
      {label}
    </span>
  );
}

export function BatchPerformanceLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
      <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
      Loading batch marks…
    </div>
  );
}

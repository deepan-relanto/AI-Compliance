"use client";

import { MetricCard } from "@/components/admin/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  BatchModuleSummary,
  BatchPerformancePayload,
} from "@/lib/batch-performance-types";
import type { InviteSendResult } from "@/lib/invite-result";
import { exportBatchPerformanceCsv } from "@/lib/batch-performance-export";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { resolveDisplayScorePercent } from "@/lib/progress-score";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  Mail,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

type StatusFilter =
  | "all"
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed"
  | "permanently_failed";

function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "failed") {
    return status === "failed" || status === "permanently_failed";
  }
  return status === filter;
}

function FilterPill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
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
        className,
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

type FlatRow = {
  key: string;
  email: string;
  displayName: string;
  moduleId: string;
  moduleTitle: string;
  status: string;
  scorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  retakeCount: number;
  lastActivity: string | null;
  reminderCount: number;
  lastRemindedAt: string | null;
  failedGuidanceCount: number;
  lastFailedGuidanceAt: string | null;
};

interface BatchPerformancePanelProps {
  data: BatchPerformancePayload;
  track?: "compliance" | "course";
  /** null / "all" = batch overview; otherwise module detail. */
  selectedModuleId?: string | null;
  onModuleChange?: (moduleId: string | null) => void;
}

export function BatchPerformancePanel({
  data,
  track = "compliance",
  selectedModuleId = null,
  onModuleChange,
}: BatchPerformancePanelProps) {
  const noun = track === "course" ? "course" : "assessment";
  const nounPlural = track === "course" ? "courses" : "assessments";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [internalModuleId, setInternalModuleId] = useState<string | null>(
    selectedModuleId,
  );
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult, setReminderResult] = useState<InviteSendResult | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [failedSending, setFailedSending] = useState(false);
  const [failedResult, setFailedResult] = useState<InviteSendResult | null>(null);
  const [failedError, setFailedError] = useState<string | null>(null);

  useEffect(() => {
    setInternalModuleId(selectedModuleId);
  }, [selectedModuleId]);

  const activeModuleId = onModuleChange ? selectedModuleId : internalModuleId;
  const isOverview = !activeModuleId;

  function selectModule(moduleId: string | null) {
    setStatusFilter("all");
    setSearch("");
    setReminderResult(null);
    setReminderError(null);
    setFailedResult(null);
    setFailedError(null);
    if (onModuleChange) onModuleChange(moduleId);
    else setInternalModuleId(moduleId);
  }

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];

    for (const learner of data.learners) {
      if (learner.assessments.length === 0) {
        rows.push({
          key: `${learner.email}-none`,
          email: learner.email,
          displayName: learner.displayName,
          moduleId: "none",
          moduleTitle: "—",
          status: "not_started",
          scorePercent: null,
          mcqCorrect: 0,
          mcqTotal: 0,
          retakeCount: 0,
          lastActivity: null,
          reminderCount: 0,
          lastRemindedAt: null,
          failedGuidanceCount: 0,
          lastFailedGuidanceAt: null,
        });
        continue;
      }
      for (const a of learner.assessments) {
        rows.push({
          key: `${learner.email}-${a.moduleId}`,
          email: learner.email,
          displayName: learner.displayName,
          moduleId: a.moduleId,
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
          reminderCount: a.reminderCount ?? 0,
          lastRemindedAt: a.lastRemindedAt ?? null,
          failedGuidanceCount: a.failedGuidanceCount ?? 0,
          lastFailedGuidanceAt: a.lastFailedGuidanceAt ?? null,
        });
      }
    }
    return rows.sort((a, b) => {
      const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return tb - ta;
    });
  }, [data.learners]);

  const moduleSummaries = useMemo(() => {
    if (data.moduleSummaries?.length) return data.moduleSummaries;

    const memberCount = data.batch.memberCount;
    return data.modules.map((m) => {
      const rows = flatRows.filter((r) => r.moduleId === m.id);
      let started = 0;
      let completed = 0;
      let inProgress = 0;
      let notStarted = 0;
      let failed = 0;
      const scored: number[] = [];
      let passed = 0;
      for (const r of rows) {
        if (r.status === "not_started") notStarted++;
        else started++;
        if (r.status === "completed") completed++;
        else if (r.status === "in_progress") inProgress++;
        else if (r.status === "failed" || r.status === "permanently_failed") {
          failed++;
        }
        if (r.scorePercent != null && r.mcqTotal > 0) {
          scored.push(r.scorePercent);
          if (r.scorePercent >= PASS_THRESHOLD_PERCENT) passed++;
        }
      }
      return {
        id: m.id,
        title: m.title,
        currentlyAssigned: m.currentlyAssigned ?? true,
        started,
        completed,
        inProgress,
        notStarted: rows.length > 0 ? notStarted : memberCount,
        failed,
        avgScore:
          scored.length > 0
            ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
            : null,
        passRate:
          scored.length > 0 ? Math.round((100 * passed) / scored.length) : null,
        compliance:
          memberCount > 0 ? Math.round((100 * completed) / memberCount) : 0,
      } satisfies BatchModuleSummary;
    });
  }, [data.moduleSummaries, data.modules, data.batch.memberCount, flatRows]);

  const activeModule = useMemo(
    () =>
      activeModuleId
        ? moduleSummaries.find((m) => m.id === activeModuleId) ??
          data.modules.find((m) => m.id === activeModuleId) ??
          null
        : null,
    [activeModuleId, moduleSummaries, data.modules],
  );

  const moduleScopedRows = useMemo(() => {
    if (!activeModuleId) return flatRows;
    return flatRows.filter((r) => r.moduleId === activeModuleId);
  }, [flatRows, activeModuleId]);

  const statusCounts = useMemo(() => {
    const source = isOverview ? flatRows : moduleScopedRows;
    const counts: Record<StatusFilter, number> = {
      all: source.length,
      not_started: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      permanently_failed: 0,
    };
    for (const r of source) {
      if (r.status === "not_started") counts.not_started++;
      else if (r.status === "in_progress") counts.in_progress++;
      else if (r.status === "completed") counts.completed++;
      else if (r.status === "failed") counts.failed++;
      else if (r.status === "permanently_failed") counts.permanently_failed++;
    }
    return counts;
  }, [flatRows, moduleScopedRows, isOverview]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = isOverview ? flatRows : moduleScopedRows;
    return source.filter((r) => {
      if (!matchesStatusFilter(r.status, statusFilter)) return false;
      if (!term) return true;
      return (
        r.email.toLowerCase().includes(term) ||
        r.displayName.toLowerCase().includes(term) ||
        r.moduleTitle.toLowerCase().includes(term)
      );
    });
  }, [flatRows, moduleScopedRows, isOverview, search, statusFilter]);

  const reminderRows = useMemo(
    () =>
      (isOverview ? [] : moduleScopedRows).filter(
        (r) => r.status === "not_started" && r.moduleId !== "none",
      ),
    [isOverview, moduleScopedRows],
  );
  const reminderModuleIds = useMemo(
    () => [...new Set(reminderRows.map((r) => r.moduleId))],
    [reminderRows],
  );
  const reminderLearnerCount = reminderRows.length;
  const canSendReminder = reminderModuleIds.length === 1;

  const failedRows = useMemo(
    () =>
      (isOverview ? [] : moduleScopedRows).filter(
        (r) =>
          (r.status === "failed" || r.status === "permanently_failed") &&
          r.moduleId !== "none",
      ),
    [isOverview, moduleScopedRows],
  );
  const failedModuleIds = useMemo(
    () => [...new Set(failedRows.map((r) => r.moduleId))],
    [failedRows],
  );
  const failedLearnerCount = failedRows.length;
  const canSendFailedGuidance = failedModuleIds.length === 1;

  async function handleResendReminder() {
    if (!canSendReminder || reminderSending) return;
    setReminderSending(true);
    setReminderError(null);
    setReminderResult(null);

    const aggregate: InviteSendResult = {
      ok: true,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      message: "",
    };

    try {
      for (const moduleId of reminderModuleIds) {
        const res = await fetch(
          `/api/modules/${encodeURIComponent(moduleId)}/send-invites`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              batchId: data.batch.id,
              mode: "not_started_reminder",
              reminderOnlyNotStarted: true,
            }),
          },
        );
        const result = (await res.json()) as InviteSendResult;
        if (!res.ok || !result.ok) aggregate.ok = false;
        aggregate.sent += Number(result.sent ?? 0);
        aggregate.skipped += Number(result.skipped ?? 0);
        aggregate.failed += Number(result.failed ?? 0);
        aggregate.errors.push(
          ...(Array.isArray(result.errors) ? result.errors : []),
        );
      }

      aggregate.message =
        aggregate.sent > 0
          ? `Reminder emails sent to ${aggregate.sent} learner${aggregate.sent === 1 ? "" : "s"}.`
          : aggregate.failed > 0
            ? `Failed to send ${aggregate.failed} reminder email(s).`
            : "No eligible not-started learners matched this reminder.";
      setReminderResult(aggregate);
    } catch {
      setReminderError("Could not reach the server.");
    } finally {
      setReminderSending(false);
    }
  }

  async function handleFailedGuidance() {
    if (!canSendFailedGuidance || failedSending) return;
    setFailedSending(true);
    setFailedError(null);
    setFailedResult(null);

    const aggregate: InviteSendResult = {
      ok: true,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      message: "",
    };

    try {
      for (const moduleId of failedModuleIds) {
        const res = await fetch(
          `/api/modules/${encodeURIComponent(moduleId)}/send-invites`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              batchId: data.batch.id,
              mode: "failed_review_guidance",
            }),
          },
        );
        const result = (await res.json()) as InviteSendResult;
        if (!res.ok || !result.ok) aggregate.ok = false;
        aggregate.sent += Number(result.sent ?? 0);
        aggregate.skipped += Number(result.skipped ?? 0);
        aggregate.failed += Number(result.failed ?? 0);
        aggregate.errors.push(
          ...(Array.isArray(result.errors) ? result.errors : []),
        );
      }

      aggregate.message =
        aggregate.sent > 0
          ? `Review-guidance emails sent to ${aggregate.sent} learner${aggregate.sent === 1 ? "" : "s"}.`
          : aggregate.failed > 0
            ? `Failed to send ${aggregate.failed} review-guidance email(s).`
            : "No eligible failed learners matched this outreach.";
      setFailedResult(aggregate);
    } catch {
      setFailedError("Could not reach the server.");
    } finally {
      setFailedSending(false);
    }
  }

  const { summary, batch } = data;
  const detailSummary = activeModuleId
    ? moduleSummaries.find((m) => m.id === activeModuleId)
    : null;

  return (
    <div className="space-y-6">
      {/* Primary module navigator */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              {nounPlural} in this batch
            </p>
            <p className="mt-0.5 text-sm text-zinc-600">
              Overview for the batch, or open one {noun} for marks, outreach, and CSV.
            </p>
          </div>
          {!isOverview && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectModule(null)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Batch overview
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterPill
            active={isOverview}
            onClick={() => selectModule(null)}
            className="rounded-lg px-3 py-1.5 text-xs"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Batch overview
          </FilterPill>
          {moduleSummaries.map((mod) => (
            <FilterPill
              key={mod.id}
              active={activeModuleId === mod.id}
              onClick={() => selectModule(mod.id)}
              className="max-w-[240px] rounded-lg px-3 py-1.5 text-xs"
            >
              <span className="truncate">{mod.title}</span>
              <span
                className={cn(
                  "tabular-nums opacity-80",
                  activeModuleId === mod.id ? "text-white/80" : "text-zinc-400",
                )}
              >
                {mod.completed}/{batch.memberCount}
              </span>
            </FilterPill>
          ))}
          {moduleSummaries.length === 0 && (
            <p className="text-xs text-zinc-500">
              No {nounPlural} assigned to this batch yet.
            </p>
          )}
        </div>
      </div>

      {/* KPI row — batch overview or selected module */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Members"
          value={String(batch.memberCount)}
          icon={Users}
          trend={
            isOverview
              ? `${summary.modulesAssigned} ${noun}${summary.modulesAssigned !== 1 ? "s" : ""} assigned · current roster`
              : activeModule?.title
                ? `Scoped to ${activeModule.title}`
                : `Selected ${noun}`
          }
        />
        {isOverview ? (
          <>
            <MetricCard
              label="Completed"
              value={String(summary.completed)}
              icon={CheckCircle2}
              trend={`${summary.inProgress} in progress · ${summary.notStarted} not started`}
            />
            <MetricCard
              label="Failed"
              value={String(summary.failed)}
              icon={AlertTriangle}
              accent="danger"
              trend="Attempts locked or failed for this batch"
            />
            <MetricCard
              label="Compliance"
              value={`${summary.compliance}%`}
              icon={Download}
              trend={
                summary.avgScore != null
                  ? `Avg score ${summary.avgScore}% · ${summary.passRate ?? 0}% pass rate`
                  : "No scored results yet"
              }
            />
          </>
        ) : (
          <>
            <MetricCard
              label="Started"
              value={String(detailSummary?.started ?? 0)}
              icon={FileSpreadsheet}
              trend="Learners who started this module"
            />
            <MetricCard
              label="Completed"
              value={String(detailSummary?.completed ?? 0)}
              icon={CheckCircle2}
              trend={`${detailSummary?.inProgress ?? 0} in progress · ${detailSummary?.failed ?? 0} failed`}
            />
            <MetricCard
              label="Avg. score"
              value={
                detailSummary?.avgScore != null
                  ? `${detailSummary.avgScore}%`
                  : "—"
              }
              icon={Download}
              trend={
                detailSummary?.passRate != null
                  ? `${detailSummary.passRate}% pass rate · ${detailSummary.compliance}% compliance`
                  : "No scored results yet"
              }
            />
          </>
        )}
      </div>

      {isOverview ? (
        <Card>
          <CardHeader className="border-b border-zinc-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="section-label">Batch overview</p>
                <h2 className="mt-1 text-base font-semibold text-zinc-900">
                  {nounPlural.charAt(0).toUpperCase() + nounPlural.slice(1)} assigned
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Select a {noun} to view marks, send reminders or failed-learner emails,
                  and download that {noun}&apos;s CSV.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/email-monitoring?batchId=${encodeURIComponent(batch.id)}&track=${track === "course" ? "course" : "compliance"}`}
                  className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium tracking-tight text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email monitoring
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    for (const mod of moduleSummaries) {
                      exportBatchPerformanceCsv(data, { moduleId: mod.id });
                    }
                  }}
                  disabled={moduleSummaries.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  {moduleSummaries.length <= 1
                    ? "Download CSV"
                    : `Download CSV (${moduleSummaries.length} files)`}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {moduleSummaries.length === 0 ? (
              <div className="empty-state border-dashed py-12">
                <p className="text-sm font-medium text-zinc-600">
                  {track === "course" ? "No courses assigned" : "No assessments assigned"}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {track === "course"
                    ? "Publish a course bundle to this batch from Courses / Content Library to see marks here."
                    : "Publish training to this batch from Upload to see marks here."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {moduleSummaries.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => selectModule(mod.id)}
                    className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#2e3192]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e3192]/25"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {mod.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {mod.currentlyAssigned ? "Currently assigned" : "Previously assigned"}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-[#2e3192]" />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          Done
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                          {mod.completed}
                          <span className="font-normal text-zinc-400">
                            /{batch.memberCount}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          Failed
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                          {mod.failed}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          Avg
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                          {mod.avgScore != null ? `${mod.avgScore}%` : "—"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b border-zinc-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="section-label">Marks & performance</p>
                <h2 className="mt-1 text-base font-semibold text-zinc-900">
                  {activeModule?.title ?? "Selected module"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Scores, status, reminders, and exports for this {noun} only. Member roster
                  is on the{" "}
                  <Link
                    href={`/admin/batch/${batch.id}`}
                    className="font-medium text-[#2e3192] hover:underline"
                  >
                    Batches
                  </Link>{" "}
                  tab.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleResendReminder()}
                  disabled={!canSendReminder || reminderSending}
                >
                  {reminderSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  {reminderSending
                    ? "Sending reminders…"
                    : `Remind not started (${reminderLearnerCount})`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleFailedGuidance()}
                  disabled={!canSendFailedGuidance || failedSending}
                >
                  {failedSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  {failedSending
                    ? "Sending guidance…"
                    : `Email failed learners (${failedLearnerCount})`}
                </Button>
                <Link
                  href={`/admin/email-monitoring?batchId=${encodeURIComponent(batch.id)}&track=${track === "course" ? "course" : "compliance"}`}
                  className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium tracking-tight text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email monitoring
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportBatchPerformanceCsv(data, { moduleId: activeModuleId })
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <FilterPill
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({statusCounts.all})
                </FilterPill>
                <FilterPill
                  active={statusFilter === "not_started"}
                  onClick={() => setStatusFilter("not_started")}
                >
                  Not started ({statusCounts.not_started})
                </FilterPill>
                <FilterPill
                  active={statusFilter === "in_progress"}
                  onClick={() => setStatusFilter("in_progress")}
                >
                  In progress ({statusCounts.in_progress})
                </FilterPill>
                <FilterPill
                  active={statusFilter === "completed"}
                  onClick={() => setStatusFilter("completed")}
                >
                  Completed ({statusCounts.completed})
                </FilterPill>
                <FilterPill
                  active={statusFilter === "failed"}
                  onClick={() => setStatusFilter("failed")}
                >
                  Failed ({statusCounts.failed + statusCounts.permanently_failed})
                </FilterPill>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  Sorted by latest activity first · this {noun} only
                </p>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or email…"
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(reminderResult || reminderError || failedResult || failedError) && (
              <div className="space-y-3 border-b border-zinc-100 px-6 py-4">
                {reminderError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                    <p className="font-semibold">Reminder send failed</p>
                    <p className="mt-1 text-xs opacity-90">{reminderError}</p>
                  </div>
                ) : reminderResult ? (
                  <div
                    className={cn(
                      "rounded-xl border px-4 py-3 text-sm",
                      reminderResult.failed > 0
                        ? "border-amber-200 bg-amber-50 text-amber-950"
                        : reminderResult.sent > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700",
                    )}
                  >
                    <p className="font-semibold">
                      {reminderResult.sent > 0
                        ? `Reminder emails sent to ${reminderResult.sent} learner${reminderResult.sent === 1 ? "" : "s"}`
                        : reminderResult.failed > 0
                          ? "Reminder send completed with failures"
                          : "No not-started learners needed a reminder"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">
                      {reminderResult.message}
                      {reminderResult.skipped > 0
                        ? ` ${reminderResult.skipped} learner${reminderResult.skipped === 1 ? "" : "s"} were skipped.`
                        : ""}
                    </p>
                  </div>
                ) : null}
                {failedError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                    <p className="font-semibold">Failed-learner email failed</p>
                    <p className="mt-1 text-xs opacity-90">{failedError}</p>
                  </div>
                ) : failedResult ? (
                  <div
                    className={cn(
                      "rounded-xl border px-4 py-3 text-sm",
                      failedResult.failed > 0
                        ? "border-amber-200 bg-amber-50 text-amber-950"
                        : failedResult.sent > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700",
                    )}
                  >
                    <p className="font-semibold">
                      {failedResult.sent > 0
                        ? `Review-guidance emails sent to ${failedResult.sent} learner${failedResult.sent === 1 ? "" : "s"}`
                        : failedResult.failed > 0
                          ? "Failed-learner send completed with failures"
                          : "No failed learners needed guidance"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">
                      {failedResult.message}
                      {failedResult.skipped > 0
                        ? ` ${failedResult.skipped} learner${failedResult.skipped === 1 ? "" : "s"} were skipped (already contacted today or not failed).`
                        : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="empty-state mx-6 my-10 border-dashed py-12">
                <p className="text-sm font-medium text-zinc-600">
                  {moduleScopedRows.length === 0
                    ? "No learners in this batch yet"
                    : "No rows match your filters"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-6 py-3">Learner</th>
                      <th className="px-6 py-3">Score</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Reminders</th>
                      <th className="px-6 py-3">Guidance</th>
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
                        displayScore != null &&
                        displayScore >= PASS_THRESHOLD_PERCENT;

                      return (
                        <tr key={row.key} className="hover:bg-zinc-50/50">
                          <td className="px-6 py-3">
                            <p className="text-sm font-semibold text-zinc-900">
                              {row.displayName}
                            </p>
                            <p className="select-text mt-0.5 font-mono text-[11px] text-zinc-500">
                              {row.email}
                            </p>
                          </td>
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
                                    ({Math.min(row.mcqCorrect, row.mcqTotal)}/
                                    {row.mcqTotal})
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
                          <td className="px-6 py-3">
                            <p className="tabular-nums font-semibold text-zinc-900">
                              {row.reminderCount}
                            </p>
                            {row.lastRemindedAt && (
                              <p className="mt-0.5 text-[10px] text-zinc-400">
                                {formatActivityDate(row.lastRemindedAt)}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <p className="tabular-nums font-semibold text-zinc-900">
                              {row.failedGuidanceCount}
                            </p>
                            {row.lastFailedGuidanceAt && (
                              <p className="mt-0.5 text-[10px] text-zinc-400">
                                {formatActivityDate(row.lastFailedGuidanceAt)}
                              </p>
                            )}
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
      )}
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

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  EmailEventRow,
  EmailEventType,
  EmailLearnerAggregate,
  EmailMonitoringPayload,
  EmailMonitoringTrack,
} from "@/lib/services/email-monitoring-service";
import {
  GraduationCap,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ViewMode = "events" | "learners";

const TYPE_LABELS: Record<EmailEventType, string> = {
  invited: "Invite",
  reminder: "Not-started reminder",
  failed_review_guidance: "Failed guidance",
  completed: "Completion",
  retake_approved: "Retake approved",
};

function formatSentAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parseTrack(raw: string | null): EmailMonitoringTrack {
  if (raw === "compliance" || raw === "course" || raw === "all") return raw;
  return "all";
}

function parseType(raw: string | null): EmailEventType | "all" {
  if (
    raw === "invited" ||
    raw === "reminder" ||
    raw === "failed_review_guidance" ||
    raw === "completed" ||
    raw === "retake_approved"
  ) {
    return raw;
  }
  return "all";
}

function TypePill({ type }: { type: EmailEventType }) {
  const tones: Record<EmailEventType, string> = {
    invited: "bg-[#2e3192]/10 text-[#2e3192]",
    reminder: "bg-amber-50 text-amber-800",
    failed_review_guidance: "bg-red-50 text-red-700",
    completed: "bg-emerald-50 text-emerald-700",
    retake_approved: "bg-sky-50 text-sky-800",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tones[type],
      )}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "border-[#2e3192] bg-[#2e3192] text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

function TrackControl({
  value,
  onChange,
}: {
  value: EmailMonitoringTrack;
  onChange: (v: EmailMonitoringTrack) => void;
}) {
  const items: { id: EmailMonitoringTrack; label: string; icon?: typeof ShieldCheck }[] = [
    { id: "all", label: "All" },
    { id: "compliance", label: "Compliance", icon: ShieldCheck },
    { id: "course", label: "Courses", icon: GraduationCap },
  ];
  return (
    <div
      role="tablist"
      aria-label="Email track"
      className="inline-flex items-center gap-1 rounded-full border border-zinc-200/90 bg-zinc-100/90 p-1"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={value === item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
              value === item.id
                ? "bg-white text-[#2e3192] shadow-sm ring-1 ring-zinc-200/80"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmailMonitoringPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [track, setTrack] = useState<EmailMonitoringTrack>(() =>
    parseTrack(searchParams.get("track")),
  );
  const [batchId, setBatchId] = useState<string>(
    () => searchParams.get("batchId")?.trim() || "all",
  );
  const [moduleId, setModuleId] = useState<string>(
    () => searchParams.get("moduleId")?.trim() || "all",
  );
  const [type, setType] = useState<EmailEventType | "all">(() =>
    parseType(searchParams.get("type")),
  );
  const [search, setSearch] = useState(() => searchParams.get("q")?.trim() || "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => searchParams.get("q")?.trim() || "",
  );
  const [view, setView] = useState<ViewMode>("events");
  const [data, setData] = useState<EmailMonitoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Keep URL in sync so batch pages can deep-link here (skip no-op replaces).
  useEffect(() => {
    const params = new URLSearchParams();
    if (track !== "all") params.set("track", track);
    if (batchId !== "all") params.set("batchId", batchId);
    if (moduleId !== "all") params.set("moduleId", moduleId);
    if (type !== "all") params.set("type", type);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const qs = params.toString();
    const next = qs ? `/admin/email-monitoring?${qs}` : "/admin/email-monitoring";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }, [track, batchId, moduleId, type, debouncedSearch, router]);

  const load = useCallback(
    async (isRefresh = false, signal?: AbortSignal) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("track", track);
        if (batchId !== "all") params.set("batchId", batchId);
        if (moduleId !== "all") params.set("moduleId", moduleId);
        if (type !== "all") params.set("type", type);
        if (debouncedSearch) params.set("q", debouncedSearch);
        const res = await fetch(`/api/email-monitoring?${params.toString()}`, {
          signal,
        });
        if (signal?.aborted) return;
        const json = (await res.json()) as EmailMonitoringPayload & {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Failed to load email monitoring");
        }
        setData(json);
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [track, batchId, moduleId, type, debouncedSearch],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(false, ac.signal);
    return () => ac.abort();
  }, [load]);

  const summary = data?.summary;
  const events = data?.events ?? [];
  const learners = data?.learners ?? [];
  const batches = data?.batches ?? [];
  const modules = data?.modules ?? [];

  // Drop stale module selection when it is no longer in the assigned list.
  useEffect(() => {
    if (moduleId === "all" || !data) return;
    if (!modules.some((m) => m.id === moduleId)) {
      setModuleId("all");
    }
  }, [data, moduleId, modules]);

  const typeCounts = useMemo(() => {
    if (!summary) {
      return {
        all: 0,
        invited: 0,
        reminder: 0,
        failed_review_guidance: 0,
        completed: 0,
        retake_approved: 0,
      };
    }
    return {
      all: summary.totalEvents,
      invited: summary.inviteCount,
      reminder: summary.reminderCount,
      failed_review_guidance: summary.failedGuidanceCount,
      completed: summary.completedCount,
      retake_approved: summary.retakeApprovedCount,
    };
  }, [summary]);

  const moduleEventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      counts.set(ev.moduleId, (counts.get(ev.moduleId) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  const handleTrackChange = (next: EmailMonitoringTrack) => {
    setTrack(next);
    setModuleId("all");
  };

  const handleBatchChange = (next: string) => {
    setBatchId(next);
    setModuleId("all");
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
        Loading email monitoring…
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <Button className="mt-4" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TrackControl value={track} onChange={handleTrackChange} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Updating…" : "Refresh"}
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Total emails logged"
          value={summary?.totalEvents ?? 0}
          hint={`${summary?.uniqueLearners ?? 0} unique learners`}
        />
        <MetricTile
          label="Not-started reminders"
          value={summary?.reminderCount ?? 0}
          hint="Resend outreach"
        />
        <MetricTile
          label="Failed guidance"
          value={summary?.failedGuidanceCount ?? 0}
          hint="Request-review emails"
        />
        <MetricTile
          label="Invites + completions"
          value={(summary?.inviteCount ?? 0) + (summary?.completedCount ?? 0)}
          hint={`${summary?.inviteCount ?? 0} invites · ${summary?.completedCount ?? 0} completions`}
        />
      </section>

      <Card>
        <CardHeader className="border-b border-zinc-100 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-label">Email monitoring</p>
              <h2 className="mt-1 text-sm font-semibold text-zinc-900">
                Logged outreach activity
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-zinc-500">
                Filter by track, batch, and modules assigned to that batch. Send
                outreach from batch analytics, then review the log here.
              </p>
              {data?.generatedAt && (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Updated {formatSentAt(data.generatedAt)}
                </p>
              )}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
              <Mail className="h-3.5 w-3.5 text-[#2e3192]" />
              Event log
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Type
              </span>
              {(
                [
                  "all",
                  "reminder",
                  "failed_review_guidance",
                  "invited",
                  "completed",
                  "retake_approved",
                ] as const
              ).map((key) => (
                <FilterPill
                  key={key}
                  active={type === key}
                  onClick={() => setType(key)}
                >
                  {key === "all"
                    ? `All (${typeCounts.all})`
                    : `${TYPE_LABELS[key]} (${typeCounts[key]})`}
                </FilterPill>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Batch
              </span>
              <FilterPill
                active={batchId === "all"}
                onClick={() => handleBatchChange("all")}
              >
                All batches
              </FilterPill>
              {batches.map((b) => (
                <FilterPill
                  key={b.id}
                  active={batchId === b.id}
                  onClick={() => handleBatchChange(b.id)}
                  title={b.label}
                >
                  {b.label}
                </FilterPill>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Module
              </span>
              <FilterPill
                active={moduleId === "all"}
                onClick={() => setModuleId("all")}
              >
                All modules
                {batchId !== "all" ? ` (${modules.length})` : ""}
              </FilterPill>
              {modules.length === 0 ? (
                <span className="text-[11px] text-zinc-400">
                  {batchId === "all"
                    ? "No modules in the email log yet for this track."
                    : "No modules assigned to this batch for the selected track."}
                </span>
              ) : (
                modules.map((m) => {
                  const count = moduleEventCounts.get(m.id);
                  const prefix =
                    track === "all"
                      ? m.track === "course"
                        ? "Course · "
                        : "Compliance · "
                      : "";
                  return (
                    <FilterPill
                      key={`${m.track}-${m.id}`}
                      active={moduleId === m.id}
                      onClick={() => setModuleId(m.id)}
                      title={m.title}
                    >
                      {prefix}
                      {m.title}
                      {count != null && moduleId === "all" ? ` (${count})` : ""}
                    </FilterPill>
                  );
                })
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setView("events")}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold",
                    view === "events"
                      ? "bg-white text-[#2e3192] shadow-sm"
                      : "text-zinc-500",
                  )}
                >
                  Event log
                </button>
                <button
                  type="button"
                  onClick={() => setView("learners")}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold",
                    view === "learners"
                      ? "bg-white text-[#2e3192] shadow-sm"
                      : "text-zinc-500",
                  )}
                >
                  By learner
                </button>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, module, batch…"
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {view === "events" ? (
            <EventLogTable events={events} />
          ) : (
            <LearnerTable learners={learners} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

function EventLogTable({ events }: { events: EmailEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="empty-state mx-6 my-10 border-dashed py-12">
        <p className="text-sm font-medium text-zinc-600">No emails logged yet</p>
        <p className="mt-1 text-xs text-zinc-400">
          Send not-started reminders or failed-learner guidance from a batch
          analytics page to populate this log.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-6 py-3">Sent</th>
            <th className="px-6 py-3">Type</th>
            <th className="px-6 py-3">Track</th>
            <th className="px-6 py-3">Learner</th>
            <th className="px-6 py-3">Module</th>
            <th className="px-6 py-3">Batch</th>
            <th className="px-6 py-3">Triggered by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {events.map((row) => (
            <tr key={`${row.track}-${row.id}`} className="hover:bg-zinc-50/50">
              <td className="px-6 py-3 text-xs tabular-nums text-zinc-500">
                {formatSentAt(row.sentAt)}
              </td>
              <td className="px-6 py-3">
                <TypePill type={row.notificationType} />
              </td>
              <td className="px-6 py-3">
                <span className="text-xs font-medium text-zinc-600">
                  {row.track === "course" ? "Courses" : "Compliance"}
                </span>
              </td>
              <td className="px-6 py-3 font-mono text-[11px] text-zinc-700">
                {row.userEmail}
              </td>
              <td className="px-6 py-3 text-zinc-800">{row.moduleTitle}</td>
              <td className="px-6 py-3 text-zinc-600">{row.batchLabel}</td>
              <td className="px-6 py-3 font-mono text-[11px] text-zinc-500">
                {row.triggeredBy ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnerTable({ learners }: { learners: EmailLearnerAggregate[] }) {
  if (learners.length === 0) {
    return (
      <div className="empty-state mx-6 my-10 border-dashed py-12">
        <p className="text-sm font-medium text-zinc-600">No learner outreach yet</p>
        <p className="mt-1 text-xs text-zinc-400">
          Aggregated resend counts appear here after emails are sent.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-6 py-3">Learner</th>
            <th className="px-6 py-3">Track</th>
            <th className="px-6 py-3">Module</th>
            <th className="px-6 py-3">Batch</th>
            <th className="px-6 py-3">Reminders</th>
            <th className="px-6 py-3">Failed guidance</th>
            <th className="px-6 py-3">Invites</th>
            <th className="px-6 py-3">Total</th>
            <th className="px-6 py-3">Last sent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {learners.map((row) => (
            <tr
              key={`${row.track}-${row.userEmail}-${row.moduleId}-${row.batchId ?? "none"}`}
              className="hover:bg-zinc-50/50"
            >
              <td className="px-6 py-3 font-mono text-[11px] text-zinc-700">
                {row.userEmail}
              </td>
              <td className="px-6 py-3 text-xs font-medium text-zinc-600">
                {row.track === "course" ? "Courses" : "Compliance"}
              </td>
              <td className="px-6 py-3 text-zinc-800">{row.moduleTitle}</td>
              <td className="px-6 py-3 text-zinc-600">{row.batchLabel}</td>
              <td className="px-6 py-3 tabular-nums font-semibold text-zinc-900">
                {row.reminderCount}
              </td>
              <td className="px-6 py-3 tabular-nums font-semibold text-zinc-900">
                {row.failedGuidanceCount}
              </td>
              <td className="px-6 py-3 tabular-nums text-zinc-700">
                {row.inviteCount}
              </td>
              <td className="px-6 py-3 tabular-nums font-semibold text-zinc-900">
                {row.totalSends}
              </td>
              <td className="px-6 py-3 text-xs text-zinc-500">
                {formatSentAt(row.lastSentAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { MetricCard } from "@/components/admin/metric-card";
import { TrackSegmentedControl } from "@/components/admin/track-segmented-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { exportFeedbackCsv, type FeedbackDisplayRow } from "@/lib/feedback-export";
import { parseRating } from "@/lib/feedback-store";
import { cn } from "@/lib/utils";
import {
  Download,
  FileSpreadsheet,
  Filter,
  Layers3,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface BatchOption {
  id: string;
  label: string;
}

function mapApiEntries(
  apiEntries: Array<{
    id: string;
    userId: string;
    userName: string;
    assessmentId: string;
    assessmentName: string;
    feedbackText: string;
    createdAt: string;
    batchId: string | null;
    batchLabel: string | null;
  }>,
): FeedbackDisplayRow[] {
  return apiEntries
    .map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.userName,
      assessmentId: e.assessmentId,
      assessmentName: e.assessmentName,
      feedbackText: e.feedbackText,
      createdAt: new Date(e.createdAt).getTime(),
      batchId: e.batchId,
      batchLabel: e.batchLabel,
      createdAtMs: new Date(e.createdAt).getTime(),
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-zinc-400">No rating</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className="h-3.5 w-3.5"
          fill={s <= rating ? "#f15a24" : "none"}
          stroke={s <= rating ? "#f15a24" : "#d4d4d8"}
          strokeWidth={1.5}
        />
      ))}
      <span className="ml-1 text-xs font-semibold tabular-nums text-zinc-600">
        {rating}/5
      </span>
    </div>
  );
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

export function FeedbackTable() {
  const [track, setTrack] = useState<"compliance" | "course">("compliance");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const feedbackUrl = track === "course" ? "/api/course-feedback" : "/api/feedback";
  const { data: fbData, isLoading: fbLoading, mutate: mutateFb } = useSWR(feedbackUrl, fetcher);
  const { data: batchData, isLoading: batchLoading } = useSWR("/api/batches", fetcher);

  const batches: BatchOption[] =
    batchData?.ok && Array.isArray(batchData.batches)
      ? batchData.batches.map((b: { id: string; label: string }) => ({
          id: b.id,
          label: b.label,
        }))
      : [];

  const apiEntries = fbData?.ok && Array.isArray(fbData.entries) ? fbData.entries : [];
  const rows = useMemo(() => mapApiEntries(apiEntries), [apiEntries]);
  
  const loading = fbLoading || batchLoading;
  
  const load = async () => {
    await mutateFb();
  };

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (batchFilter !== "all" && r.batchId !== batchFilter) return false;
      if (
        term &&
        !r.userId.toLowerCase().includes(term) &&
        !r.assessmentName.toLowerCase().includes(term) &&
        !(r.batchLabel ?? "").toLowerCase().includes(term) &&
        !r.feedbackText.toLowerCase().includes(term)
      )
        return false;
      return true;
    });
  }, [rows, batchFilter, searchTerm]);

  const activeBatchLabel = batches.find((b) => b.id === batchFilter)?.label;

  const stats = useMemo(() => {
    const rated = filtered.filter((r) => parseRating(r.feedbackText).rating != null);
    const avgRating =
      rated.length > 0
        ? Math.round(
            (rated.reduce((a, r) => a + (parseRating(r.feedbackText).rating ?? 0), 0) /
              rated.length) *
              10,
          ) / 10
        : null;
    const uniqueBatches = new Set(filtered.map((r) => r.batchId).filter(Boolean)).size;
    return { total: filtered.length, avgRating, uniqueBatches };
  }, [filtered]);

  const filterActive = batchFilter !== "all" || searchTerm.trim().length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
        Loading feedback…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <TrackSegmentedControl value={track} onChange={setTrack} />
        <div className="empty-state mx-auto max-w-md">
          <MessageSquare className="h-10 w-10 text-zinc-300" strokeWidth={1.5} />
          <p className="mt-4 text-sm font-medium text-zinc-600">No feedback submitted yet</p>
          <p className="mt-1 text-xs text-zinc-400">
            Feedback appears here after learners complete{" "}
            {track === "course" ? "AI courses" : "assessments"} and submit their responses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TrackSegmentedControl value={track} onChange={setTrack} />

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total submissions"
          value={stats.total}
          icon={MessageSquare}
          accent="brand"
          trend={filterActive ? "Filtered view" : "All time"}
        />
        <MetricCard
          label="Avg. rating"
          value={stats.avgRating ?? "—"}
          suffix={stats.avgRating != null ? "/5" : undefined}
          icon={Star}
          accent="accent"
          trend={
            stats.avgRating != null
              ? "From rated submissions"
              : "No ratings yet"
          }
        />
        <MetricCard
          label="Batches represented"
          value={stats.uniqueBatches}
          icon={Layers3}
          accent="muted"
        />
      </section>

      {/* Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">All feedback</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {filtered.length} of {rows.length} submission
                {rows.length !== 1 ? "s" : ""} — newest first
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportFeedbackCsv(filtered, activeBatchLabel)}
                disabled={filtered.length === 0}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {batchFilter === "all" ? "Export CSV" : "Export batch CSV"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Batch filter pills */}
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <Filter className="h-3 w-3" />
                Batch
              </span>
              <FilterPill active={batchFilter === "all"} onClick={() => setBatchFilter("all")}>
                All batches
              </FilterPill>
              {batches.map((b) => {
                const count = rows.filter((r) => r.batchId === b.id).length;
                return (
                  <FilterPill
                    key={b.id}
                    active={batchFilter === b.id}
                    onClick={() => setBatchFilter(b.id)}
                  >
                    {b.label.split("—")[0]?.trim() ?? b.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-0.5 rounded-full px-1 text-[9px]",
                          batchFilter === b.id
                            ? "bg-white/20"
                            : "bg-zinc-100 text-zinc-500",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </FilterPill>
                );
              })}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search learner, batch, assessment…"
                className="h-9 w-full min-w-[220px] rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15 sm:w-72"
              />
            </div>
          </div>

          {batchFilter !== "all" && activeBatchLabel && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2e3192]/15 bg-[#2e3192]/5 px-3 py-2">
              <p className="text-xs text-zinc-600">
                Showing feedback from{" "}
                <span className="font-semibold text-[#2e3192]">{activeBatchLabel}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => exportFeedbackCsv(filtered, activeBatchLabel)}
              >
                <Download className="h-3 w-3" />
                Download {activeBatchLabel.split("—")[0]?.trim()} CSV
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="empty-state mx-6 my-8 border-dashed py-12">
              <Users className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-zinc-600">
                No feedback matches your filters
              </p>
              <button
                type="button"
                onClick={() => {
                  setBatchFilter("all");
                  setSearchTerm("");
                }}
                className="mt-2 text-xs font-medium text-[#2e3192] hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-6 py-3">Learner</th>
                    <th className="px-6 py-3">Batch</th>
                    <th className="px-6 py-3">Assessment</th>
                    <th className="px-6 py-3">Rating</th>
                    <th className="px-6 py-3">Feedback</th>
                    <th className="px-6 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filtered.map((entry) => {
                    const { rating, body } = parseRating(entry.feedbackText);
                    return (
                      <tr key={entry.id} className="group hover:bg-zinc-50/60">
                        <td className="px-6 py-4 align-top">
                          <p className="font-mono text-xs text-zinc-700">{entry.userId}</p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          {entry.batchLabel ? (
                            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                              {entry.batchLabel}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">Unknown batch</span>
                          )}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <p className="font-medium text-zinc-800">{entry.assessmentName}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
                            {entry.assessmentId}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <StarRating rating={rating} />
                        </td>
                        <td className="max-w-xs px-6 py-4 align-top">
                          <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">
                            {body || entry.feedbackText}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-top whitespace-nowrap text-xs tabular-nums text-zinc-500">
                          {new Date(entry.createdAtMs).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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

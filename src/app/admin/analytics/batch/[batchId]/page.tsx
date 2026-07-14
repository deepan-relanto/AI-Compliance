"use client";

import {
  BatchPerformanceLoading,
  BatchPerformancePanel,
} from "@/components/admin/batch-performance-panel";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import type { BatchPerformancePayload } from "@/lib/batch-performance-types";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Track = "compliance" | "course";

export default function BatchAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = typeof params.batchId === "string" ? params.batchId : "";
  const [track, setTrack] = useState<Track>("compliance");
  const [data, setData] = useState<BatchPerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/analytics/batch/${encodeURIComponent(batchId)}?track=${track}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.batch) {
          setData({
            batch: json.batch,
            summary: json.summary,
            modules: json.modules ?? [],
            learners: json.learners ?? [],
            generatedAt: json.generatedAt ?? new Date().toISOString(),
          });
        } else {
          setData(null);
          setError(json.error ?? "Could not load batch performance.");
        }
      })
      .catch(() => {
        setData(null);
        setError("Could not reach the server.");
      })
      .finally(() => setLoading(false));
  }, [batchId, track]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && !data && !error) router.replace("/admin/analytics");
  }, [loading, data, error, router]);

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        wide
        title={data?.batch.label ?? "Batch marks"}
        subtitle={
          data?.batch.description ||
          "Learner scores, completion status, and exports for this batch."
        }
        backHref="/admin/analytics"
        backLabel="Analytics"
      >
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTrack("compliance")}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                track === "compliance"
                  ? "border-[#2e3192] bg-[#2e3192] text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              Security Compliance
            </button>
            <button
              type="button"
              onClick={() => setTrack("course")}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                track === "course"
                  ? "border-[#2e3192] bg-[#2e3192] text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              AI-course
            </button>
          </div>
          {data && (
            <Link
              href={`/admin/batch/${batchId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:border-zinc-300 hover:text-[#2e3192]"
            >
              <Users className="h-3.5 w-3.5" />
              View member roster (Batches tab)
            </Link>
          )}
        </div>

        {loading && <BatchPerformanceLoading />}
        {!loading && error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!loading && data && (
          <BatchPerformancePanel data={data} track={track} />
        )}
      </AdminShell>
    </RouteGuard>
  );
}

"use client";

import {
  BatchPerformanceLoading,
  BatchPerformancePanel,
} from "@/components/admin/batch-performance-panel";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import type { BatchPerformancePayload } from "@/lib/batch-performance-types";
import type { ModuleKind } from "@/lib/module-kind";
import { MODULE_KIND_LABELS } from "@/lib/module-kind";
import { cn } from "@/lib/utils";
import { GraduationCap, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const TRACKS: { id: ModuleKind; label: string; icon: typeof ShieldCheck }[] = [
  { id: "compliance", label: "Compliance & assessments", icon: ShieldCheck },
  { id: "course", label: "Courses & learning", icon: GraduationCap },
];

export default function BatchAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = typeof params.batchId === "string" ? params.batchId : "";
  const [track, setTrack] = useState<ModuleKind>("compliance");
  const [data, setData] = useState<BatchPerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/batch/${encodeURIComponent(batchId)}?track=${track}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.batch) {
          setData({
            track: json.track ?? track,
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
    void loadData();
  }, [loadData]);

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
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/60 p-1">
            {TRACKS.map((t) => {
              const active = track === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrack(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-white text-[#2e3192] shadow-sm ring-1 ring-zinc-200/80"
                      : "text-zinc-600 hover:bg-white/60",
                  )}
                >
                  <t.icon className="h-4 w-4" strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <Link
            href={`/admin/batch/${batchId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:border-zinc-300 hover:text-[#2e3192]"
          >
            <Users className="h-3.5 w-3.5" />
            View member roster
          </Link>
        </div>

        <p className="mb-6 text-sm text-zinc-500">
          Showing <span className="font-medium text-zinc-700">{MODULE_KIND_LABELS[track]}</span>{" "}
          modules only. Pass threshold remains 70% for both tracks.
        </p>

        {loading && <BatchPerformanceLoading />}
        {!loading && error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!loading && data && <BatchPerformancePanel data={data} />}
      </AdminShell>
    </RouteGuard>
  );
}

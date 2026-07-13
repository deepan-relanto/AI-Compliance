"use client";

import type { BatchInfo } from "@/lib/types";
import { ArrowRight, Loader2, Users } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function mapBatch(row: Record<string, unknown>): BatchInfo {
  return {
    id: row.id as string,
    label: row.label as string,
    description: (row.description as string) ?? "",
    memberCount: Number(row.member_count ?? row.memberCount ?? 0),
    compliance: Number(row.compliance ?? 0),
    passRate: Number(row.pass_rate ?? row.passRate ?? 0),
    failRate: Number(row.fail_rate ?? row.failRate ?? 0),
    activeSessions: Number(row.active_sessions ?? row.activeSessions ?? 0),
  };
}

export function BatchPicker() {
  const { data, error, isLoading } = useSWR("/api/batches", fetcher);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
        Loading batches…
      </div>
    );
  }

  const batches: BatchInfo[] = data?.ok && Array.isArray(data.batches) 
    ? data.batches.map(mapBatch) 
    : [];

  if (error) {
    return <div className="p-6 text-sm text-red-500">Failed to load batches.</div>;
  }

  if (batches.length === 0) {
    return (
      <div className="surface-card px-6 py-14 text-center text-sm text-zinc-500">
        No batches yet. Use <span className="font-medium text-zinc-700">Create batch</span> to filter
        the HR directory and assign your first roster.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {batches.map((batch) => (
        <Link key={batch.id} href={`/admin/batch/${batch.id}`} className="group">
          <article className="surface-card-interactive flex h-full flex-col p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-label">Training batch</p>
                <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-zinc-900 group-hover:text-[#2e3192]">
                  {batch.label}
                </h3>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2e3192]/12 bg-[#2e3192]/6">
                <Users className="h-4 w-4 text-[#2e3192]" strokeWidth={1.75} />
              </div>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-500">
              {batch.description}
            </p>
            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                <Users className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                {batch.memberCount} member{batch.memberCount !== 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-[#2e3192] transition-colors group-hover:text-[#3d42a8]">
                View roster
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
              </span>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}

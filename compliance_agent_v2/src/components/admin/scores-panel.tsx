"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { resolveDisplayScorePercent } from "@/lib/progress-score";
import { cn } from "@/lib/utils";
import { Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface ScoreRow {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  status: string;
  scorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  retakeCount: number;
}

interface BatchOption {
  id: string;
  label: string;
}

export function ScoresPanel() {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const loadScores = useCallback(async (batchId?: string) => {
    setLoading(true);
    try {
      const q =
        batchId && batchId !== "all"
          ? `?batchId=${encodeURIComponent(batchId)}`
          : "";
      const res = await fetch(`/api/progress/admin${q}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.scores)) {
        setScores(data.scores);
      } else {
        setScores([]);
      }
    } catch {
      setScores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.batches)) {
          setBatches(
            data.batches.map((b: { id: string; label: string }) => ({
              id: b.id,
              label: b.label,
            })),
          );
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadScores(batchFilter === "all" ? undefined : batchFilter);
  }, [batchFilter, loadScores]);

  const filtered =
    batchFilter === "all"
      ? scores
      : scores.filter((s) => s.batchId === batchFilter);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Learner results
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900">
              Assessment scores
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Passing threshold: above {PASS_THRESHOLD_PERCENT}%. At or below requires a retake.
            </p>
          </div>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
          >
            <option value="all">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scores…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No scored attempts yet. Learners will appear here after completing checkpoint assessments.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3">Assessment</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Retakes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
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
                    <tr key={`${row.userEmail}-${row.moduleId}`} className="bg-white">
                      <td className="px-4 py-3 font-medium text-zinc-800">
                        {row.userEmail}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{row.moduleTitle}</td>
                      <td className="px-4 py-3 text-zinc-500">{row.batchId}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            passed
                              ? "bg-emerald-50 text-emerald-700"
                              : displayScore != null
                                ? "bg-amber-50 text-amber-800"
                                : "bg-zinc-100 text-zinc-600",
                          )}
                        >
                          {displayScore != null ? (
                            <>
                              <Trophy className="h-3 w-3" />
                              {displayScore}%
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                        {row.mcqTotal > 0 && (
                          <span className="mt-0.5 block text-[11px] text-zinc-400">
                            {row.mcqCorrect}/{row.mcqTotal} correct
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-600">
                        {row.status.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{row.retakeCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBatches } from "@/hooks/use-batches";
import type { CourseLibraryItem } from "@/lib/course-step-types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  GraduationCap,
  Layers,
  Loader2,
  Mail,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function ReuseCoursePanel() {
  const { batches } = useBatches();
  const [library, setLibrary] = useState<CourseLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [mcqCount, setMcqCount] = useState(0);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content/course-library");
      const data = await res.json();
      if (data.ok && Array.isArray(data.library)) {
        setLibrary(data.library.filter((m: CourseLibraryItem) => m.canReuse));
      }
    } catch {
      setLibrary([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const selected = library.find((m) => m.id === selectedId);

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId],
    );
  };

  async function handleAssignAndEmail() {
    if (!selected) return;
    if (selectedBatchIds.length === 0) {
      setError("Select at least one batch.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(selected.id)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIds: selectedBatchIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Could not assign course.");
        return;
      }
      setMcqCount(selected.mcqCount);
      setDoneMsg(data.message ?? "Course assigned. Invitation emails sent when mail is configured.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleClone() {
    if (!selected) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Enter a title (at least 3 characters) to clone as a new course.");
      return;
    }
    if (selectedBatchIds.length === 0) {
      setError("Select at least one batch.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/courses/reuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModuleId: selected.id,
          title: trimmed,
          description: selected.description,
          batchIds: selectedBatchIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Could not publish course.");
        return;
      }
      setMcqCount(data.mcqCount ?? selected.mcqCount);
      setDoneMsg(data.message ?? "Course cloned and published.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  if (doneMsg) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h3 className="text-lg font-semibold text-zinc-900">Course bundle assigned</h3>
          <p className="max-w-md text-sm text-zinc-600">
            {doneMsg}
            {mcqCount ? ` (${mcqCount} quiz questions).` : ""}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setDoneMsg(null);
              setSelectedId(null);
              setTitle("");
              setSelectedBatchIds([]);
              void loadLibrary();
            }}
          >
            Assign again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-zinc-100">
          <p className="section-label">Course reuse library</p>
          <h2 className="mt-1 text-base font-semibold text-zinc-900">
            Assign an existing course bundle and email learners
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pick your published bundle, choose batches, then Assign &amp; email. Learners with a
            Microsoft account in those batches get an invitation link.
          </p>
        </CardHeader>
        <CardContent className="p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
              Loading course library…
            </div>
          ) : library.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 py-12 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-zinc-300" />
              <p className="mt-3 text-sm font-medium text-zinc-600">No reusable courses yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                Build and publish a full course bundle under &quot;Build new course&quot; first.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {library.map((item) => {
                const active = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setTitle(item.title);
                      setError(null);
                    }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      active
                        ? "border-[#2e3192]/40 bg-[#2e3192]/5 ring-2 ring-[#2e3192]/20"
                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/80",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                        <Layers className="h-5 w-5 text-violet-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                          {item.description || "No description"}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-zinc-600">
                          {item.stepCount} steps · {item.mcqCount} questions · ~
                          {item.durationMinutes} min
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="border-b border-zinc-100">
            <h3 className="text-sm font-semibold text-zinc-900">Assign to batches</h3>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              {batches.map((batch) => {
                const checked = selectedBatchIds.includes(batch.id);
                return (
                  <label
                    key={batch.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3",
                      checked ? "border-[#2e3192]/30 bg-[#2e3192]/5" : "border-zinc-200",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBatch(batch.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-[#2e3192]"
                    />
                    <span className="text-sm font-medium text-zinc-800">{batch.label}</span>
                  </label>
                );
              })}
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-700">
                Optional — new title if cloning a copy
              </label>
              <Input
                className="mt-1.5"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Only needed for Clone as new course"
              />
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => void handleAssignAndEmail()}
                disabled={publishing}
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Assign &amp; email batches
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleClone()}
                disabled={publishing}
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Clone as new course
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void loadLibrary()}>
                Refresh library
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

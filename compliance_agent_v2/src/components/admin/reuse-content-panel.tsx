"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";
import type { BatchInfo } from "@/lib/types";
import type { LibraryModule } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function mapBatch(row: Record<string, unknown>): BatchInfo {
  return {
    id: row.id as string,
    label: row.label as string,
    description: (row.description as string) ?? "",
    memberCount: Number(row.member_count ?? 0),
    compliance: Number(row.compliance ?? 0),
    passRate: Number(row.pass_rate ?? 0),
    failRate: Number(row.fail_rate ?? 0),
    activeSessions: Number(row.active_sessions ?? 0),
  };
}

export function ReuseContentPanel() {
  const user = useAuthStore((s) => s.user);
  const [library, setLibrary] = useState<LibraryModule[]>([]);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [publishedAssignmentTitle, setPublishedAssignmentTitle] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content/library");
      const data = await res.json();
      if (data.ok && Array.isArray(data.library)) {
        setLibrary(data.library.filter((m: LibraryModule) => m.canReuse));
      }
    } catch {
      setLibrary([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
    fetch("/api/batches")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.batches)) {
          setBatches(data.batches.map(mapBatch));
        }
      })
      .catch(() => undefined);
  }, [loadLibrary]);

  const selected = library.find((m) => m.id === selectedId);

  const alreadyAssignedBatchIds = useMemo(() => {
    const norm = assignmentTitle.trim().toLowerCase();
    if (!norm) return new Set<string>();
    const ids = new Set<string>();
    for (const item of library) {
      if (item.title.trim().toLowerCase() !== norm) continue;
      for (const batch of item.batches) {
        ids.add(batch.id);
      }
    }
    return ids;
  }, [library, assignmentTitle]);

  const titleMatchesExistingAssignment = useMemo(() => {
    const norm = assignmentTitle.trim().toLowerCase();
    if (!norm) return false;
    return library.some((item) => item.title.trim().toLowerCase() === norm);
  }, [library, assignmentTitle]);

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId],
    );
  };

  async function handlePublish() {
    if (!selected) return;
    const trimmedTitle = assignmentTitle.trim();
    if (!trimmedTitle) {
      setError("Enter an assignment name.");
      return;
    }
    if (selectedBatchIds.length === 0) {
      setError("Select at least one batch.");
      return;
    }
    if (
      titleMatchesExistingAssignment &&
      selectedBatchIds.some((batchId) => alreadyAssignedBatchIds.has(batchId))
    ) {
      const labels = batches
        .filter(
          (batch) =>
            selectedBatchIds.includes(batch.id) &&
            alreadyAssignedBatchIds.has(batch.id),
        )
        .map((batch) => batch.label);
      setError(
        `Assignment "${trimmedTitle}" is already assigned to ${labels.map((label) => `"${label}"`).join(", ")}. Change the assignment name to push it to the same batch again.`,
      );
      return;
    }
    setError(null);
    setPublishing(true);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          title: trimmedTitle,
          pdfUrl: selected.pdfUrl,
          batchIds: selectedBatchIds,
          uploadedBy: user?.username ?? "admin@relnto.com",
          reuseModuleId: selected.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? "Update failed.");
        return;
      }
      const inviteMsg =
        typeof json.invites?.message === "string" ? json.invites.message : null;
      setPublishedAssignmentTitle(trimmedTitle);
      setDoneMessage(
        json.cloned
          ? `Created new assignment "${trimmedTitle}" with a fresh module id.`
          : inviteMsg,
      );
      setDone(true);
      void loadLibrary();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  function handleReset() {
    setSelectedId(null);
    setAssignmentTitle("");
    setSelectedBatchIds([]);
    setError(null);
    setDone(false);
    setDoneMessage(null);
    setPublishedAssignmentTitle(null);
    void loadLibrary();
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center px-8 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <h2 className="mt-4 text-xl font-semibold text-zinc-900">
            Training pushed to batches
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {publishedAssignmentTitle ? (
              <>
                Assignment <span className="font-medium text-zinc-800">&ldquo;{publishedAssignmentTitle}&rdquo;</span> is saved in the reuse library and assigned to the selected batches.
              </>
            ) : (
              <>The PDF and checkpoint questions are now assigned to the selected batches.</>
            )}
            {doneMessage ? ` ${doneMessage}` : " Invitation emails were sent to learners in those batches."}
            {" "}Renaming creates a new assignment entry with fresh learner progress while reusing the same PDF and questions.
          </p>
          <Button variant="secondary" className="mt-8" onClick={handleReset}>
            <RefreshCcw className="h-4 w-4" />
            Push to more batches
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Reuse library
          </p>
          <h2 className="mt-1 text-base font-semibold text-zinc-900">
            Push existing PDF &amp; questions to batches
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Select content that already has generated MCQs. The same PDF and questions are assigned without calling the LLM again.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading library…
            </div>
          ) : library.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              No reusable content yet. Upload and publish a new assessment first.
            </p>
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
                      setAssignmentTitle(item.title);
                      setSelectedBatchIds(item.batches.map((b) => b.id));
                      setError(null);
                    }}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      active
                        ? "border-[#2e3192] bg-[#2e3192]/5 ring-1 ring-[#2e3192]/20"
                        : "border-zinc-200 bg-white hover:border-zinc-300",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 shrink-0 text-[#2e3192]" />
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{item.title}</p>
                        {item.sourceTitle && (
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            Same PDF as: {item.sourceTitle}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">
                          {item.slideCount} pages · {item.mcqCount} questions
                        </p>
                        {item.batches.length > 0 && (
                          <p className="mt-1 text-[11px] text-zinc-400">
                            Currently: {item.batches.map((b) => b.label).join(", ")}
                          </p>
                        )}
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
          <CardHeader>
            <h2 className="text-base font-semibold text-zinc-900">Assign to batches</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="reuse-assignment-title"
                className="text-sm font-medium text-zinc-700"
              >
                Assignment name
              </label>
              <Input
                id="reuse-assignment-title"
                value={assignmentTitle}
                onChange={(e) => {
                  setAssignmentTitle(e.target.value);
                  setError(null);
                }}
                placeholder="Name shown to learners and used for batch assignment"
              />
              <p className="text-xs text-zinc-500">
                Same name + same batch is blocked. Renaming creates a new assignment id with fresh learner progress (same PDF and questions).
              </p>
            </div>

            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Reusing PDF &amp; questions from:{" "}
              <span className="font-medium text-zinc-900">{selected.title}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {batches.map((batch) => {
                const checked = selectedBatchIds.includes(batch.id);
                const alreadyAssigned =
                  titleMatchesExistingAssignment && alreadyAssignedBatchIds.has(batch.id);
                return (
                  <label
                    key={batch.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm",
                      checked
                        ? "border-[#2e3192]/40 bg-[#2e3192]/5"
                        : "border-zinc-200",
                      alreadyAssigned && checked && "border-amber-300 bg-amber-50/80",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBatch(batch.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-[#2e3192]"
                    />
                    <span>
                      <span className="font-medium text-zinc-800">{batch.label}</span>
                      {alreadyAssigned && checked && (
                        <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
                          Already assigned under this name
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </p>
            )}

            <Button variant="primary" disabled={publishing} onClick={handlePublish}>
              {publishing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <Layers className="h-3.5 w-3.5" />
                  Push to selected batches
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

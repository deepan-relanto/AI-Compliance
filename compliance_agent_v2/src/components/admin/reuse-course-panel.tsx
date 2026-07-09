"use client";

import { InviteResultBanner } from "@/components/admin/invite-result-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBatches } from "@/hooks/use-batches";
import type { CourseLibraryItem } from "@/lib/course-step-types";
import type { InviteSendResult } from "@/lib/invite-result";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Layers,
  Loader2,
  Mail,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type DoneState = {
  mode: "assign" | "clone";
  invites?: InviteSendResult;
  mcqCount: number;
  bundleTitle: string;
};

export function ReuseCoursePanel() {
  const { batches } = useBatches();
  const [library, setLibrary] = useState<CourseLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cloneTitle, setCloneTitle] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const [mailReady, setMailReady] = useState<boolean | null>(null);

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/mail/status");
        const data = await res.json();
        setMailReady(Boolean(data.ok));
      } catch {
        setMailReady(null);
      }
    })();
  }, []);

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
      setDone({
        mode: "assign",
        invites: data.invites,
        mcqCount: selected.mcqCount,
        bundleTitle: selected.title,
      });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleClone() {
    if (!selected) return;
    const trimmed = cloneTitle.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Enter a new title (at least 3 characters) for the cloned copy.");
      return;
    }
    if (trimmed.toLowerCase() === selected.title.trim().toLowerCase()) {
      setError(
        'Same title as the source bundle. Use "Assign & email batches" instead, or pick a different title for a clone.',
      );
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
        setError(data.message ?? "Could not clone course.");
        return;
      }
      setDone({
        mode: "clone",
        invites: data.invites,
        mcqCount: data.mcqCount ?? selected.mcqCount,
        bundleTitle: trimmed,
      });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h3 className="text-lg font-semibold text-zinc-900">
            {done.mode === "assign" ? "Bundle assigned" : "Bundle cloned"}
          </h3>
          <p className="max-w-md text-sm text-zinc-600">
            <strong>{done.bundleTitle}</strong> — {done.mcqCount} quiz question
            {done.mcqCount === 1 ? "" : "s"}.
            {done.mode === "assign"
              ? " The same course bundle was assigned to the selected batches."
              : " A new copy was created and assigned."}
          </p>
          <InviteResultBanner invites={done.invites} />
          <Button
            variant="secondary"
            onClick={() => {
              setDone(null);
              setSelectedId(null);
              setCloneTitle("");
              setShowClone(false);
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
            Assign an existing bundle and email learners
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Select your bundle, choose batches, then click <strong>Assign &amp; email</strong>.
            This reuses the same bundle — it does not create a duplicate.
          </p>
          {mailReady === false && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Mail is not fully configured on this server. Bundles can still be assigned, but
              invitation emails will not send until MAIL_FROM_ADDRESS and Azure Mail.Send are set.
            </p>
          )}
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
                      setCloneTitle("");
                      setShowClone(false);
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
                        {item.batches.length > 0 && (
                          <p className="mt-1 text-[10px] text-zinc-400">
                            Currently on: {item.batches.map((b) => b.label).join(", ")}
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
          <CardHeader className="border-b border-zinc-100">
            <h3 className="text-sm font-semibold text-zinc-900">
              Assign &quot;{selected.title}&quot; to batches
            </h3>
            <p className="text-xs text-zinc-500">
              Learners with <code className="text-zinc-600">role=user</code> and a matching{" "}
              <code className="text-zinc-600">batch_id</code> receive an invitation email.
            </p>
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
              <Button variant="ghost" size="sm" onClick={() => void loadLibrary()}>
                Refresh library
              </Button>
            </div>

            <div className="border-t border-zinc-100 pt-4">
              <button
                type="button"
                onClick={() => setShowClone((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-zinc-500 hover:text-zinc-700"
              >
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", showClone && "rotate-180")}
                />
                Advanced: clone as a separate copy (creates a new bundle)
              </button>
              {showClone && (
                <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
                  <p className="text-xs text-zinc-600">
                    Only use this if you need a second, independent course record. You must enter a{" "}
                    <strong>different title</strong> than &quot;{selected.title}&quot;.
                  </p>
                  <Input
                    value={cloneTitle}
                    onChange={(e) => setCloneTitle(e.target.value)}
                    placeholder={`e.g. ${selected.title} — Q2 cohort`}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleClone()}
                    disabled={publishing || !cloneTitle.trim()}
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                    Clone as new course
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

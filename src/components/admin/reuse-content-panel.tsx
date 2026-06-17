"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBatches } from "@/hooks/use-batches";
import { useAuthStore } from "@/lib/auth-store";
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
import { useCallback, useEffect, useState } from "react";

function makeAssessmentId(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Date.now().toString(36)
  );
}

export function ReuseContentPanel() {
  const user = useAuthStore((s) => s.user);
  const { batches } = useBatches();
  const [library, setLibrary] = useState<LibraryModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mcqCount, setMcqCount] = useState(0);

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
  }, [loadLibrary]);

  const selected = library.find((m) => m.id === selectedId);

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId],
    );
  };

  async function handlePublish() {
    if (!selected) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Enter a title (at least 3 characters).");
      return;
    }
    if (selectedBatchIds.length === 0) {
      setError("Select at least one batch.");
      return;
    }
    setError(null);
    setPublishing(true);
    const id = makeAssessmentId(trimmed);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: trimmed,
          description: `Reused from "${selected.title}"`,
          slideCount: selected.slideCount,
          pdfUrl: selected.pdfUrl,
          batchIds: selectedBatchIds,
          uploadedBy: user?.username ?? "admin@relnto.com",
          reuseModuleId: selected.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? "Publish failed.");
        return;
      }
      setMcqCount(json.mcqCount ?? 0);
      setDone(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  function handleReset() {
    setSelectedId(null);
    setTitle("");
    setSelectedBatchIds([]);
    setError(null);
    setDone(false);
    void loadLibrary();
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center px-8 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <h2 className="mt-4 text-xl font-semibold text-zinc-900">Published to batches</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Reused PDF and {mcqCount} existing checkpoint question
            {mcqCount === 1 ? "" : "s"} — no new LLM generation.
          </p>
          <Button variant="secondary" className="mt-8" onClick={handleReset}>
            <RefreshCcw className="h-4 w-4" />
            Publish another
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
                      setTitle(`${item.title} (copy)`);
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
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Reusing: <span className="font-medium text-zinc-900">{selected.title}</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">New assessment title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {batches.map((batch) => {
                const checked = selectedBatchIds.includes(batch.id);
                return (
                  <label
                    key={batch.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm",
                      checked
                        ? "border-[#2e3192]/40 bg-[#2e3192]/5"
                        : "border-zinc-200",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBatch(batch.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-[#2e3192]"
                    />
                    <span className="font-medium text-zinc-800">{batch.label}</span>
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
                  Publish to selected batches
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

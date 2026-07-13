"use client";

/**
 * UploadPanel
 *
 * Admin workflow:
 *   1. idle       — drop-zone / file picker
 *   2. processing — storing PDF via /api/convert
 *   3. naming     — PDF ready; admin enters an assessment name
 *   4. done       — assessment saved to Neon; shown on user dashboard
 *   error         — any step failure
 *
 * Design tokens used: Card, CardHeader, CardContent, Button, Input,
 * zinc palette, #2e3192 brand, #f15a24 accent, shadow-[var(--shadow-card)].
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";
import { makeAssessmentId } from "@/lib/assessment-id";
import type { BatchInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Layers,
  Loader2,
  RefreshCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PanelState = "idle" | "processing" | "naming" | "done" | "error";

interface ConversionResult {
  pdfUrl: string;
  originalName: string;
  pageCount: number;
}

type QuestionMode = "ai" | "hybrid";

const MAX_MB = 50;
const PDF_EXTS = [".pdf"];
const PDF_MIME = ["application/pdf"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileExtension(file: File): string {
  return "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
}

function isPdfFile(file: File): boolean {
  const ext = fileExtension(file);
  return PDF_EXTS.includes(ext) || PDF_MIME.includes(file.type);
}

function validateFile(file: File): string | null {
  if (!isPdfFile(file)) {
    return "Only .pdf files are accepted.";
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `File exceeds the ${MAX_MB} MB limit (${formatBytes(file.size)}).`;
  }
  return null;
}

function displayPdfName(originalName: string): string {
  return originalName.replace(/\.pdf$/i, ".pdf");
}

function guessAssessmentName(originalName: string): string {
  return originalName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files[0]) onFile(files[0]);
    },
    [onFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload PDF file"
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-8 py-14 text-center transition-colors",
        dragging
          ? "border-[#2e3192] bg-[#2e3192]/5"
          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100/60",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#2e3192]/8">
        <UploadCloud className="h-6 w-6 text-[#2e3192]" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-700">
          Drag &amp; drop your file here, or{" "}
          <span className="text-[#2e3192] underline underline-offset-2">browse</span>
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Accepted: .pdf · Max {MAX_MB} MB
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-400">
          PDF files are stored directly.
        </p>
      </div>
      <input
        ref={inputRef}
        id="pdf-file-input"
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
    </div>
  );
}

function FileChip({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#2e3192]/8">
        <FileText className="h-4 w-4 text-[#2e3192]" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800">{file.name}</p>
        <p className="text-xs text-zinc-400">{formatBytes(file.size)}</p>
      </div>
      {!disabled && (
        <button
          id="remove-file-btn"
          onClick={onRemove}
          aria-label="Remove file"
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function InlineAlert({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  const isError = type === "error";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      )}
      <span>{message}</span>
    </div>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Upload PDF", "Review", "Create assessment"] as const;

function StepIndicator({ current }: { current: 0 | 1 | 2 }) {
  return (
    <div className="flex w-full items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                      ? "border-[#2e3192] bg-[#2e3192] text-white"
                      : "border-zinc-200 bg-white text-zinc-400",
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> : i + 1}
              </div>
              <span
                className={cn(
                  "mt-1.5 whitespace-nowrap text-[11px] font-medium",
                  active ? "text-zinc-800" : done ? "text-emerald-600" : "text-zinc-400",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-px flex-1 transition-colors",
                  done ? "bg-emerald-400" : "bg-zinc-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

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

export function UploadPanel() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<PanelState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [assessmentName, setAssessmentName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [createdTitle, setCreatedTitle] = useState("");
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [assignedBatches, setAssignedBatches] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [questionMode] = useState<QuestionMode>("ai");
  const [createdModuleId, setCreatedModuleId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState<"pending" | "generating" | "completed" | "failed">("pending");
  const [generatedCount, setGeneratedCount] = useState(0);

  const isProcessing = state === "processing";

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.batches)) {
          setBatches(data.batches.map(mapBatch));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (state !== "done" || !createdModuleId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/modules/${encodeURIComponent(createdModuleId)}/generation-status`,
        );
        const json = await res.json();
        if (!res.ok || !json.ok || cancelled) return;
        const status = String(json.status ?? "pending");
        const progress = Number(json.progress ?? 0);
        setGenerationProgress(progress);
        setGeneratedCount(Number(json.questionCount ?? 0));

        if (status === "completed" || status === "failed") {
          setGenerationStatus(status);
          return;
        }
        setGenerationStatus("generating");
        window.setTimeout(poll, 1200);
      } catch {
        if (!cancelled) window.setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [state, createdModuleId]);

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId],
    );
    setBatchError(null);
  };

  // ── Step index for the indicator ────────────────────────────────────────
  const stepIndex: 0 | 1 | 2 =
    state === "idle" || state === "error" ? 0
    : state === "processing" ? 1
    : 2; // naming | done

  function handleFileSelect(selected: File) {
    const err = validateFile(selected);
    if (err) {
      setValidationError(err);
      setFile(null);
      return;
    }
    setValidationError(null);
    setServerError(null);
    setFile(selected);
    setState("idle");
    setConversionResult(null);
  }

  function handleReset() {
    setFile(null);
    setValidationError(null);
    setServerError(null);
    setConversionResult(null);
    setAssessmentName("");
    setNameError(null);
    setState("idle");
    setCreatedModuleId(null);
    setGenerationProgress(0);
    setGenerationStatus("pending");
    setGeneratedCount(0);
  }

  async function handleConvert() {
    if (!file || isProcessing) return;
    const err = validateFile(file);
    if (err) { setValidationError(err); return; }

    setState("processing");
    setServerError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/convert", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setServerError(json.message ?? "An unexpected error occurred.");
        setState("error");
        return;
      }

      setAssessmentName(guessAssessmentName(json.originalName));
      setConversionResult({
        pdfUrl: json.pdfUrl,
        originalName: json.originalName,
        pageCount: typeof json.pageCount === "number" && json.pageCount > 0
          ? json.pageCount
          : 1,
      });
      setState("naming");
    } catch {
      setServerError("Could not reach the server. Check your connection and try again.");
      setState("error");
    }
  }

  async function handleCreateAssessment() {
    if (!conversionResult) return;

    const trimmedName = assessmentName.trim();
    if (!trimmedName) {
      setNameError("Please enter an assessment name.");
      return;
    }
    if (trimmedName.length < 3) {
      setNameError("Name must be at least 3 characters.");
      return;
    }
    if (selectedBatchIds.length === 0) {
      setBatchError("Select at least one batch to assign this assessment.");
      return;
    }
    setNameError(null);
    setBatchError(null);
    setPublishError(null);
    setPublishing(true);

    const id = makeAssessmentId(trimmedName);
    const description = `Uploaded from ${conversionResult.originalName}`;

    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: trimmedName,
          description,
          slideCount: conversionResult.pageCount,
          durationMinutes: 20,
          pdfUrl: conversionResult.pdfUrl,
          batchIds: selectedBatchIds,
          uploadedBy: user?.username ?? "admin@relnto.com",
          questionMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPublishError(json.message ?? "Could not save assessment to the database.");
        return;
      }

      const labels = batches
        .filter((b) => selectedBatchIds.includes(b.id))
        .map((b) => b.label);
      setAssignedBatches(labels);
      setCreatedTitle(trimmedName);
      setCreatedModuleId(id);
      setGenerationStatus("pending");
      setGenerationProgress(0);
      setGeneratedCount(0);
      setState("done");
    } catch {
      setPublishError("Could not reach the server. Check DATABASE_URL and NVIDIA_API_KEY.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleRetryGeneration() {
    if (!createdModuleId) return;
    setPublishError(null);
    setGenerationStatus("pending");
    setGenerationProgress(0);
    try {
      const res = await fetch(
        `/api/modules/${encodeURIComponent(createdModuleId)}/generation-status`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPublishError(json.message ?? "Could not retry question generation.");
        setGenerationStatus("failed");
        return;
      }
      setGenerationStatus("generating");
    } catch {
      setPublishError("Could not reach the server to retry generation.");
      setGenerationStatus("failed");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* ── Step indicator (hidden in final done state) ─────────────────── */}
      {state !== "done" && <StepIndicator current={stepIndex} />}

      {/* ── Upload / Convert card (steps 1 & 2) ────────────────────────── */}
      {(state === "idle" || state === "processing" || state === "error") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Content upload
                </p>
                <h2 className="mt-1 text-base font-semibold text-zinc-900">
                  Upload training PDF
                </h2>
              </div>
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2e3192]" />
                  Uploading PDF…
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {!file && (
              <DropZone onFile={handleFileSelect} disabled={isProcessing} />
            )}

            {validationError && (
              <InlineAlert type="error" message={validationError} />
            )}
            {serverError && state === "error" && (
              <InlineAlert type="error" message={serverError} />
            )}

            {file && (
              <FileChip file={file} onRemove={handleReset} disabled={isProcessing} />
            )}

            {file && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  id="convert-btn"
                  variant="primary"
                  size="md"
                  disabled={isProcessing}
                  onClick={handleConvert}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading PDF…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
                {!isProcessing && (
                  <Button id="cancel-btn" variant="ghost" size="md" onClick={handleReset}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Naming card (step 3) ────────────────────────────────────────── */}
      {state === "naming" && conversionResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
                  Upload complete
                </p>
                <h2 className="text-base font-semibold text-zinc-900">
                  Name your assessment
                </h2>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Converted file summary */}
            <div className="flex items-center gap-3 rounded-md border border-emerald-100 bg-emerald-50/50 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-800">
                  {displayPdfName(conversionResult.originalName)}
                </p>
                <p className="text-xs text-zinc-400">
                  {conversionResult.pageCount} page{conversionResult.pageCount === 1 ? "" : "s"}
                  {" · uploaded as-is"}
                </p>
              </div>
              <a
                href={conversionResult.pdfUrl}
                download={displayPdfName(conversionResult.originalName)}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-[#2e3192]"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </div>

            {/* Batch assignment */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">Assign to batches</p>
              {batches.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Loading batches… run <code>npm run db:seed</code> if none appear.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {batches.map((batch) => {
                    const checked = selectedBatchIds.includes(batch.id);
                    return (
                      <label
                        key={batch.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                          checked
                            ? "border-[#2e3192]/40 bg-[#2e3192]/5"
                            : "border-zinc-200 bg-white hover:border-zinc-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBatch(batch.id)}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#2e3192]"
                        />
                        <span>
                          <span className="font-medium text-zinc-800">{batch.label}</span>
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            {batch.memberCount} learners
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {batchError && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {batchError}
                </p>
              )}
            </div>

            {publishError && <InlineAlert type="error" message={publishError} />}

            {/* Assessment name field */}
            <div className="space-y-1.5">
              <label
                htmlFor="assessment-name-input"
                className="block text-sm font-medium text-zinc-700"
              >
                Assessment name
              </label>
              <Input
                id="assessment-name-input"
                placeholder="e.g. Q3 Security Compliance"
                value={assessmentName}
                onChange={(e) => {
                  setAssessmentName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAssessment()}
                autoFocus
              />
              {nameError && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {nameError}
                </p>
              )}
              <p className="text-xs text-zinc-400">
                This name will appear on the user dashboard alongside existing modules.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                id="create-assessment-btn"
                variant="primary"
                size="md"
                disabled={publishing}
                onClick={handleCreateAssessment}
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating checkpoint questions…
                  </>
                ) : (
                  <>
                    <Layers className="h-3.5 w-3.5" />
                    Create Assessment
                  </>
                )}
              </Button>
              <Button
                id="back-to-upload-btn"
                variant="ghost"
                size="md"
                onClick={handleReset}
              >
                Start over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Done card ──────────────────────────────────────────────────────── */}
      {state === "done" && (
        <Card>
          <CardContent className="flex flex-col items-center px-8 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" strokeWidth={1.5} />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-emerald-600">
              Assessment created
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
              {createdTitle}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
              {generationStatus === "completed" ? (
                <>
                  Published to:{" "}
                  <span className="font-medium text-zinc-700">
                    {assignedBatches.length > 0 ? assignedBatches.join(", ") : "selected batches"}
                  </span>
                  . Assessment is now live for users.
                </>
              ) : generationStatus === "failed" ? (
                "Question generation failed. This assessment will not be available to learners until generation succeeds."
              ) : (
                "Preparing question pool in the background. This assessment becomes visible to learners only after generation completes."
              )}
            </p>
            <div className="mt-5 w-full max-w-xl rounded-md border border-zinc-200 bg-zinc-50 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Question generation progress
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
                <span>
                  {generationStatus === "completed"
                    ? "Completed"
                    : generationStatus === "failed"
                      ? "Failed"
                      : "Generating in background..."}
                </span>
                <span className="font-medium">{generationProgress}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    generationStatus === "failed" ? "bg-red-500" : "bg-[#2e3192]",
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, generationProgress))}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Questions available in pool: <span className="font-semibold text-zinc-700">{generatedCount}</span>
              </p>
            </div>
            <Button
              id="upload-another-btn"
              variant="secondary"
              size="lg"
              className="mt-8"
              onClick={handleReset}
            >
              <RefreshCcw className="h-4 w-4" />
              Upload another file
            </Button>
            {generationStatus === "failed" && (
              <Button
                id="retry-generation-btn"
                variant="primary"
                size="lg"
                className="mt-3"
                onClick={handleRetryGeneration}
              >
                <RefreshCcw className="h-4 w-4" />
                Retry question generation
              </Button>
            )}
            {publishError && <div className="mt-4 w-full max-w-xl"><InlineAlert type="error" message={publishError} /></div>}
          </CardContent>
        </Card>
      )}

      {state !== "done" && (
        <p className="text-center text-xs text-zinc-400">
          PDF uploads are stored directly. Files live in{" "}
          <code className="text-zinc-500">public/uploads/</code>.
        </p>
      )}
    </div>
  );
}

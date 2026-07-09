"use client";

import { InviteResultBanner } from "@/components/admin/invite-result-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBatches } from "@/hooks/use-batches";
import {
  COURSE_STEP_LABELS,
  COURSE_STEP_ORDER,
  type CourseStepType,
} from "@/lib/course-step-types";
import type { InviteSendResult } from "@/lib/invite-result";
import { postFormWithProgress } from "@/lib/upload-with-progress";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCode2,
  FileJson,
  GraduationCap,
  Image,
  Loader2,
  Network,
  Upload,
  Video,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type WizardStep = "info" | CourseStepType | "publish" | "done";
type MediaKind = "lesson" | "video" | "mindmap" | "infographic";

const WIZARD_STEPS: WizardStep[] = [
  "info",
  ...COURSE_STEP_ORDER,
  "publish",
];

const STEP_ICONS: Record<CourseStepType, typeof FileCode2> = {
  pdf: FileCode2,
  video: Video,
  mindmap: Network,
  infographic: Image,
  quiz: FileJson,
};

const MEDIA_KIND: Partial<Record<CourseStepType, MediaKind>> = {
  pdf: "lesson",
  video: "video",
  mindmap: "mindmap",
  infographic: "infographic",
};

const ACCEPT_BY_STEP: Partial<Record<CourseStepType, string>> = {
  pdf: ".html,.htm,text/html",
  video: ".mp4,.webm,.mov,video/*",
  mindmap: ".html,.htm,text/html",
  infographic: ".png,.jpg,.jpeg,.webp,.pdf,image/*,application/pdf",
  quiz: ".json,application/json",
};

export function CourseBuilderPanel() {
  const { batches } = useBatches();
  const [step, setStep] = useState<WizardStep>("info");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [publishInvites, setPublishInvites] = useState<InviteSendResult | undefined>();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null);

  const stepIndex = WIZARD_STEPS.indexOf(step);

  const markComplete = useCallback((s: WizardStep) => {
    setCompletedSteps((prev) => new Set([...prev, s]));
  }, []);

  const saveStepConfig = async (
    stepType: CourseStepType,
    config: Record<string, unknown>,
  ) => {
    if (!moduleId) throw new Error("Course not created yet.");
    const res = await fetch(`/api/courses/${encodeURIComponent(moduleId)}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepType, config }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message ?? "Could not save step.");
    }
  };

  const handleCreateCourse = async () => {
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setError("Enter a course title (at least 3 characters).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description: description.trim(),
          durationMinutes,
          batchIds: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Could not create course.");
        return;
      }
      setModuleId(data.moduleId as string);
      markComplete("info");
      setStep("pdf");
      setSuccessMsg("Course draft created. Upload your interactive HTML lesson first.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadMedia = async (
    stepType: "pdf" | "video" | "mindmap" | "infographic",
  ) => {
    const kind = MEDIA_KIND[stepType];
    if (!uploadFile || !kind) {
      setError("Choose a file to upload.");
      return;
    }
    setLoading(true);
    setError(null);
    setUploadProgress(0);
    setUploadPhase("uploading");
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", uploadFile);
      const { ok, json } = await postFormWithProgress("/api/courses/media", form, (pct) => {
        setUploadProgress(pct);
      });
      if (!ok || !json.ok) {
        setError((json.message as string) ?? "Upload failed.");
        return;
      }
      setUploadPhase("saving");
      setUploadProgress(100);
      await saveStepConfig(stepType, {
        assetUrl: json.assetUrl as string,
        originalName: json.originalName as string,
        mimeType: json.mimeType as string,
        ...(stepType === "pdf" ? { pageCount: 1 } : {}),
      });
      markComplete(stepType);
      setUploadFile(null);
      if (htmlPreviewUrl) {
        URL.revokeObjectURL(htmlPreviewUrl);
        setHtmlPreviewUrl(null);
      }
      const nextIdx = COURSE_STEP_ORDER.indexOf(stepType) + 1;
      setStep(COURSE_STEP_ORDER[nextIdx] ?? "publish");
      setSuccessMsg(`${COURSE_STEP_LABELS[stepType]} saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setLoading(false);
      setUploadPhase("idle");
      setUploadProgress(0);
    }
  };

  const handleImportQuiz = async () => {
    if (!moduleId || !uploadFile) {
      setError("Choose a question bank JSON file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const text = await uploadFile.text();
      const parsed = JSON.parse(text) as { questions?: unknown };
      const res = await fetch(`/api/courses/${encodeURIComponent(moduleId)}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsed.questions ?? parsed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Import failed.");
        return;
      }
      setQuestionCount(data.imported as number);
      markComplete("quiz");
      setUploadFile(null);
      setStep("publish");
      setSuccessMsg(`Imported ${data.imported} quiz question(s). Assign batches to publish.`);
    } catch {
      setError("Invalid JSON file or server error.");
    } finally {
      setLoading(false);
    }
  };

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId],
    );
  };

  const handlePublish = async () => {
    if (!moduleId) return;
    if (selectedBatchIds.length === 0) {
      setError("Select at least one batch.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(moduleId)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIds: selectedBatchIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Publish failed.");
        return;
      }
      if (typeof data.message === "string" && data.message.trim()) {
        setSuccessMsg(data.message);
      }
      setPublishInvites(data.invites);
      markComplete("publish");
      setStep("done");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = useCallback(() => {
    setStep("info");
    setTitle("");
    setDescription("");
    setModuleId(null);
    setCompletedSteps(new Set());
    setSelectedBatchIds([]);
    setUploadFile(null);
    if (htmlPreviewUrl) URL.revokeObjectURL(htmlPreviewUrl);
    setHtmlPreviewUrl(null);
    setError(null);
    setSuccessMsg(null);
    setPublishInvites(undefined);
    setQuestionCount(0);
  }, [htmlPreviewUrl]);

  const handleUploadFile = useCallback(
    (file: File | null) => {
      setUploadFile(file);
      if (htmlPreviewUrl) {
        URL.revokeObjectURL(htmlPreviewUrl);
        setHtmlPreviewUrl(null);
      }
      if (!file) return;
      if (step === "pdf" || step === "mindmap") {
        const name = file.name.toLowerCase();
        if (name.endsWith(".html") || name.endsWith(".htm") || file.type.includes("html")) {
          setHtmlPreviewUrl(URL.createObjectURL(file));
        }
      }
    },
    [step, htmlPreviewUrl],
  );

  const currentContentStep = step !== "info" && step !== "publish" && step !== "done" ? step : null;

  const stepLabel = useMemo(() => {
    if (step === "info") return "Course details";
    if (step === "publish") return "Publish to batches";
    if (step === "done") return "Complete";
    return COURSE_STEP_LABELS[step];
  }, [step]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
            <GraduationCap className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Build new course bundle</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Upload content in order: interactive HTML lesson → training video → HTML mind map →
              infographic → quiz. The full bundle is stored together and can be reused for other
              batches.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1">
          {WIZARD_STEPS.map((s, i) => {
            const done = completedSteps.has(s);
            const active = step === s;
            const label =
              s === "info"
                ? "Details"
                : s === "publish"
                  ? "Publish"
                  : COURSE_STEP_LABELS[s as CourseStepType]?.split(" ")[0] ?? s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s === "info" || completedSteps.has(s) || i <= stepIndex) {
                    setStep(s);
                    setError(null);
                  }
                }}
                disabled={s !== "info" && !moduleId}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                  active
                    ? "bg-violet-600 text-white shadow-sm"
                    : done
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200/80"
                      : "bg-zinc-100 text-zinc-500",
                  s !== "info" && !moduleId && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    active ? "bg-white/20" : done ? "bg-emerald-200/60" : "bg-zinc-200/80",
                  )}
                >
                  {done && !active ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {successMsg && step !== "done" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMsg}
        </p>
      )}

      <Card>
        <CardHeader className="border-b border-zinc-100">
          <p className="section-label">Step {stepIndex + 1} of {WIZARD_STEPS.length}</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-900">{stepLabel}</h3>
          {moduleId && step !== "info" && step !== "done" && (
            <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{moduleId}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {step === "info" && (
            <>
              <div>
                <label className="text-sm font-medium text-zinc-700">Course title</label>
                <Input
                  className="mt-1.5"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. AI Basics for Leaders"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">Description</label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What learners will cover in this course"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Estimated duration (minutes)
                </label>
                <Input
                  type="number"
                  min={5}
                  className="mt-1.5 w-32"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
                />
              </div>
              <Button variant="primary" onClick={() => void handleCreateCourse()} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Create draft &amp; start bundle
              </Button>
            </>
          )}

          {currentContentStep &&
            (currentContentStep === "pdf" ||
              currentContentStep === "video" ||
              currentContentStep === "mindmap" ||
              currentContentStep === "infographic") && (
              <>
                <UploadZone
                  icon={STEP_ICONS[currentContentStep]}
                  title={COURSE_STEP_LABELS[currentContentStep]}
                  hint={
                    currentContentStep === "pdf"
                      ? "Self-contained .html lesson (interactive slides). Stored in course assets."
                      : currentContentStep === "video"
                        ? "MP4, WebM, or MOV (max 100 MB). Stored locally on the server."
                        : currentContentStep === "mindmap"
                          ? "Interactive .html mind map (e.g. mindmap-01.html). Stored in course assets."
                          : "PNG, JPEG, WebP, or PDF infographic (max 100 MB)."
                  }
                  accept={ACCEPT_BY_STEP[currentContentStep]!}
                  file={uploadFile}
                  onFile={
                    currentContentStep === "pdf" || currentContentStep === "mindmap"
                      ? handleUploadFile
                      : setUploadFile
                  }
                  disabled={loading}
                />
                {(currentContentStep === "pdf" || currentContentStep === "mindmap") && (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="border-b border-zinc-100 px-4 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f15a24]">
                        Live preview
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Same iframe view learners will see after upload.
                      </p>
                    </div>
                    <div className="h-[min(420px,50vh)] bg-[#f8f9fb]">
                      {htmlPreviewUrl ? (
                        <iframe
                          title="HTML preview"
                          src={htmlPreviewUrl}
                          className="h-full w-full border-0"
                          sandbox="allow-scripts allow-same-origin allow-forms"
                        />
                      ) : (
                        <p className="flex h-full items-center justify-center px-4 text-center text-sm text-zinc-500">
                          Select an HTML file to preview.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {uploadPhase !== "idle" && (
                  <UploadProgressPanel
                    fileName={uploadFile?.name ?? "File"}
                    progress={uploadProgress}
                    phase={uploadPhase}
                    isVideo={currentContentStep === "video"}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const prev =
                        COURSE_STEP_ORDER[COURSE_STEP_ORDER.indexOf(currentContentStep) - 1];
                      if (prev) setStep(prev);
                      else setStep("info");
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void handleUploadMedia(currentContentStep)}
                    disabled={loading || !uploadFile}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload &amp; continue
                  </Button>
                </div>
              </>
            )}

          {currentContentStep === "quiz" && (
            <>
              <UploadZone
                icon={FileJson}
                title="Assessment quiz"
                hint='JSON with a "questions" array — each with prompt, options, correctOptionId (or correctOptionIds for multi-select).'
                accept={ACCEPT_BY_STEP.quiz!}
                file={uploadFile}
                onFile={setUploadFile}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("infographic")}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleImportQuiz()}
                  disabled={loading || !uploadFile}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileJson className="h-4 w-4" />
                  )}
                  Import quiz &amp; continue
                </Button>
              </div>
            </>
          )}

          {step === "publish" && (
            <>
              <p className="text-sm text-zinc-600">
                All five bundle steps are ready. Assign this course to one or more batches to make
                it visible to learners.
              </p>
              <div className="space-y-2">
                {batches.map((batch) => {
                  const checked = selectedBatchIds.includes(batch.id);
                  return (
                    <label
                      key={batch.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3",
                        checked ? "border-violet-300 bg-violet-50" : "border-zinc-200",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBatch(batch.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                      />
                      <span className="text-sm font-medium text-zinc-800">{batch.label}</span>
                      <span className="text-xs text-zinc-500">{batch.memberCount} learners</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("quiz")}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button variant="primary" onClick={() => void handlePublish()} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Publish course bundle
                </Button>
              </div>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <h3 className="text-lg font-semibold text-zinc-900">Course bundle published</h3>
              <p className="max-w-md text-sm text-zinc-600">
                {successMsg ??
                  `Learners in the selected batches will see this course under My training. The full bundle (HTML lesson, video, HTML mind map, infographic, ${questionCount || "quiz"} questions) is stored and available for reuse.`}
              </p>
              <InviteResultBanner invites={publishInvites} />
              <Button variant="secondary" onClick={resetForm}>
                Build another course
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadZone({
  icon: Icon,
  title,
  hint,
  accept,
  file,
  onFile,
  disabled = false,
}: {
  icon: typeof FileCode2;
  title: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-6 transition-opacity",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
          <Icon className="h-5 w-5 text-violet-700" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-800">{title}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
      <input
        type="file"
        accept={accept}
        className="mt-4 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-700"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <p className="mt-2 text-xs font-medium text-zinc-600">
          Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
        </p>
      )}
    </div>
  );
}

function UploadProgressPanel({
  fileName,
  progress,
  phase,
  isVideo,
}: {
  fileName: string;
  progress: number;
  phase: "uploading" | "saving";
  isVideo: boolean;
}) {
  const label =
    phase === "saving"
      ? "Saving to course bundle…"
      : isVideo
        ? "Uploading video…"
        : "Uploading file…";

  return (
    <div className="overflow-hidden rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50 to-white p-5">
      <div className="flex items-center gap-4">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/20" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-200">
            {isVideo ? (
              <Video className="h-5 w-5 animate-pulse" />
            ) : (
              <Upload className="h-5 w-5 animate-pulse" />
            )}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          <p className="truncate text-xs text-zinc-500">{fileName}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all duration-300 ease-out"
              style={{ width: `${Math.max(progress, phase === "saving" ? 100 : 4)}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-[11px] font-semibold tabular-nums text-violet-700">
            {phase === "saving" ? "Finalizing…" : `${progress}%`}
          </p>
        </div>
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-600" />
      </div>
    </div>
  );
}

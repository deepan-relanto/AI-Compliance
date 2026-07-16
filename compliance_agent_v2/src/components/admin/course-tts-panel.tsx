"use client";

import { FloatingAvatar } from "@/components/course/floating-avatar";
import { Button } from "@/components/ui/button";
import { clientCourseAssetUrl } from "@/lib/course-asset-url";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, RefreshCcw, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type TtsStep = {
  stepOrder: number;
  stepType: string;
  title: string;
  config: {
    assetUrl?: string;
    originalName?: string;
    mimeType?: string;
  };
};

type TtsSegment = {
  id: string;
  sourceStepType: string;
  stepOrder: number;
  beatKey: string;
  slideIndex: number;
  fragmentIndex: number;
  slideTitle: string | null;
  rawText: string;
  scriptText: string;
};

type TtsPayload = {
  sandboxId: string;
  title: string;
  description: string;
  settings: {
    ttsEnabled: boolean;
    avatarEnabled: boolean;
    scriptStatus: "not_started" | "generating" | "generated" | "reviewed" | "failed";
  };
  steps: TtsStep[];
  segments: TtsSegment[];
};

type PreviewBeatState = {
  slideIndex: number;
  fragmentIndex: number;
};

export function CourseTtsPanel({
  moduleId,
  moduleTitle,
  onContinue,
}: {
  moduleId: string;
  moduleTitle: string;
  onContinue: () => void;
}) {
  const [payload, setPayload] = useState<TtsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewSyncRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/courses/${encodeURIComponent(moduleId)}/tts`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          if (data.ok) {
            setPayload(data as TtsPayload);
            setActiveSegmentId((data as TtsPayload).segments[0]?.id ?? null);
            setError(null);
          } else {
            setError(data.message ?? "Could not load TTS sandbox.");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load TTS sandbox.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const activeSegment = useMemo(
    () => payload?.segments.find((segment) => segment.id === activeSegmentId) ?? payload?.segments[0] ?? null,
    [payload, activeSegmentId],
  );

  const htmlPreviewUrl = useMemo(() => {
    const htmlStep = payload?.steps.find((step) =>
      ["pdf", "scenarios", "mindmap"].includes(step.stepType) &&
      String(step.config?.mimeType ?? "").includes("html"),
    ) ?? payload?.steps.find((step) =>
      String(step.config?.assetUrl ?? "").toLowerCase().endsWith(".html"),
    );
    return clientCourseAssetUrl(htmlStep?.config?.assetUrl);
  }, [payload]);

  const syncActiveSegmentToPreview = (state: PreviewBeatState) => {
    setActiveSegmentId((current) => {
      const segments = payload?.segments ?? [];
      const exact =
        segments.find(
          (segment) =>
            segment.slideIndex === state.slideIndex &&
            segment.fragmentIndex === state.fragmentIndex,
        ) ??
        segments.find(
          (segment) =>
            segment.slideIndex === state.slideIndex &&
            segment.fragmentIndex === 0,
        ) ??
        current;

      return typeof exact === "string" ? exact : exact?.id ?? current;
    });
  };

  useEffect(() => {
    if (!payload || !htmlPreviewUrl || !iframeRef.current) return;

    const iframe = iframeRef.current;

    const readPreviewState = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const slides = Array.from(doc.querySelectorAll("section.slide"));
        if (slides.length === 0) return;
        const activeSlideIndex = slides.findIndex((slide) =>
          slide.classList.contains("present") ||
          slide.classList.contains("active") ||
          slide.getAttribute("aria-hidden") === "false",
        );
        const slideIndex = activeSlideIndex >= 0 ? activeSlideIndex : 0;
        const activeSlide = slides[slideIndex];
        const fragments = Array.from(activeSlide?.querySelectorAll(".fragment") ?? []);
        const fragmentIndex = fragments.findIndex((fragment) =>
          fragment.classList.contains("current-fragment") ||
          fragment.classList.contains("visible") ||
          fragment.classList.contains("active"),
        );

        syncActiveSegmentToPreview({
          slideIndex,
          fragmentIndex: fragmentIndex >= 0 ? fragmentIndex + 1 : 0,
        });
      } catch {
        return;
      }
    };

    const bindPreviewSync = () => {
      previewSyncRef.current = window.setInterval(readPreviewState, 250);
      readPreviewState();
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;
        win?.addEventListener("hashchange", readPreviewState);
        doc?.addEventListener("click", () => {
          window.setTimeout(readPreviewState, 40);
        });
        doc?.addEventListener("keydown", () => {
          window.setTimeout(readPreviewState, 40);
        });
      } catch {
        return;
      }
    };

    const handleLoad = () => {
      if (previewSyncRef.current != null) {
        window.clearInterval(previewSyncRef.current);
      }
      bindPreviewSync();
    };

    iframe.addEventListener("load", handleLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      handleLoad();
    }

    return () => {
      iframe.removeEventListener("load", handleLoad);
      if (previewSyncRef.current != null) {
        window.clearInterval(previewSyncRef.current);
        previewSyncRef.current = null;
      }
    };
  }, [payload, htmlPreviewUrl]);

  const updateSettings = async (patch: Partial<TtsPayload["settings"]>) => {
    const previousPayload = payload;
    setPayload((current) =>
      current == null
        ? current
        : {
            ...current,
            settings: {
              ...current.settings,
              ...patch,
              avatarEnabled:
                patch.ttsEnabled === false
                  ? false
                  : patch.avatarEnabled ?? current.settings.avatarEnabled,
            },
          },
    );
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(moduleId)}/tts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayload(previousPayload);
        setError(data.message ?? "Could not save TTS settings.");
        return;
      }
      setPayload(data as TtsPayload);
    } catch {
      setPayload(previousPayload);
      setError("Could not save TTS settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!activeSegment) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/courses/${encodeURIComponent(moduleId)}/tts/segments/${encodeURIComponent(activeSegment.id)}/generate`,
        {
        method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Could not generate TTS scripts.");
        return;
      }
      setPayload(data as TtsPayload);
      setActiveSegmentId(activeSegment.id);
    } catch {
      setError("Could not generate the current TTS script.");
    } finally {
      setGenerating(false);
    }
  };

  const handleNextBeat = () => {
    try {
      iframeRef.current?.contentWindow?.document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      iframeRef.current?.contentWindow?.postMessage({ type: "next" }, "*");
    } catch {
      return;
    }
  };

  const handleSaveSegment = async () => {
    if (!activeSegment) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/courses/${encodeURIComponent(moduleId)}/tts/segments/${encodeURIComponent(activeSegment.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptText: activeSegment.scriptText }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Could not save script.");
        return;
      }
      setPayload(data as TtsPayload);
    } catch {
      setError("Could not save script.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white p-10 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
        Loading TTS script step…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f15a24]">
              TTS script step
            </p>
            <h3 className="mt-1 text-lg font-semibold text-zinc-900">
              Review and generate narration beat-by-beat for {moduleTitle}
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Preview each beat, generate one TTS script at a time, edit it, then move to the next beat.
            </p>
          </div>
          {payload && (
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              Status: {payload.settings.scriptStatus.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid items-start gap-5 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-900">Narration controls</p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant="primary"
                onClick={() => void handleGenerate()}
                disabled={generating || !activeSegment}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Generate current beat
              </Button>
              <Button variant="secondary" onClick={handleNextBeat} disabled={!htmlPreviewUrl}>
                Next beat
              </Button>
              <Button variant="secondary" onClick={onContinue}>
                <CheckCircle2 className="h-4 w-4" />
                Continue to publish
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-900">Preview-linked beat</p>
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
              <p className="text-xs font-semibold text-zinc-800">
                {activeSegment
                  ? `${activeSegment.slideTitle ?? `Step ${activeSegment.stepOrder}`} · Beat ${activeSegment.fragmentIndex + 1}`
                  : "No active beat"}
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                {activeSegment?.scriptText || activeSegment?.rawText || "Navigate the preview to load the current beat."}
              </p>
              <p
                className={cn(
                  "mt-2 text-[11px] font-medium",
                  activeSegment?.scriptText.trim()
                    ? "text-emerald-600"
                    : "text-amber-600",
                )}
              >
                {activeSegment?.scriptText.trim() ? "TTS generated" : "Awaiting generation"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-900">Slide preview + avatar bubble</p>
              <p className="text-xs text-zinc-500">
                The avatar preview sits in the bottom-right corner and reads the selected TTS script.
              </p>
            </div>
            <div className="relative isolate aspect-[16/10] min-h-[420px] overflow-hidden bg-[#f8f9fb]">
              {htmlPreviewUrl ? (
                <iframe
                  ref={iframeRef}
                  title="Course HTML preview"
                  src={htmlPreviewUrl}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
                  Upload an HTML lesson or scenario to preview slides with TTS.
                </div>
              )}
              <FloatingAvatar
                script={activeSegment?.scriptText ?? ""}
                enabled={Boolean(payload?.settings.avatarEnabled)}
                variant="admin"
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Selected script</p>
                <p className="text-xs text-zinc-500">
                  Generate this beat, review the narration, then move to the next beat.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSaveSegment()}
                disabled={!activeSegment || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save script
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Extracted content
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {activeSegment?.rawText ?? "Select a generated beat to inspect the extracted slide text."}
                </p>
              </div>
              <textarea
                value={activeSegment?.scriptText ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setPayload((current) =>
                    current == null
                      ? current
                      : {
                          ...current,
                          segments: current.segments.map((segment) =>
                            segment.id === activeSegment?.id
                              ? { ...segment, scriptText: value }
                              : segment,
                          ),
                        },
                  );
                }}
                rows={8}
                disabled={!activeSegment}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="Generated TTS script will appear here."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

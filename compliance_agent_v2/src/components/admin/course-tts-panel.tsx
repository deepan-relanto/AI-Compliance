"use client";

import { Button } from "@/components/ui/button";
import { clientCourseAssetUrl } from "@/lib/course-asset-url";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, Mic, RefreshCcw, Save, Volume2, VolumeX } from "lucide-react";
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

declare global {
  interface Window {
    webkitSpeechSynthesis?: SpeechSynthesis;
  }
}

function getSpeechEngine(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? window.webkitSpeechSynthesis ?? null;
}

function FloatingAvatarPreview({
  script,
  enabled,
}: {
  script: string;
  enabled: boolean;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const headRef = useRef<HTMLDivElement | null>(null);
  const headInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const modelUrl = process.env.NEXT_PUBLIC_TALKINGHEAD_MODEL_URL;
    const cdnUrl =
      process.env.NEXT_PUBLIC_TALKINGHEAD_CDN_URL ??
      "https://esm.sh/@met4citizen/talkinghead?bundle";

    if (!enabled || !modelUrl || typeof window === "undefined") {
      setAvatarReady(false);
      return;
    }

    (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ cdnUrl);
        if (cancelled || !headRef.current || !mod?.TalkingHead) return;
        const head = new mod.TalkingHead(headRef.current, {
          ttsEndpoint: "",
          cameraView: "upper",
          avatarMood: "neutral",
        });
        if (typeof head.showAvatar === "function") {
          await head.showAvatar({
            url: modelUrl,
            body: "F",
            avatarMood: "neutral",
            lipsyncLang: "en",
          });
        }
        headInstanceRef.current = head;
        setAvatarReady(true);
      } catch {
        setAvatarReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const handleSpeak = () => {
    const synth = getSpeechEngine();
    if (!synth || !script.trim()) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(script.trim());
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.volume = muted ? 0 : 1;
    utterance.onstart = () => {
      setSpeaking(true);
    };
    utterance.onend = () => {
      setSpeaking(false);
    };
    utterance.onerror = () => {
      setSpeaking(false);
    };
    synth.speak(utterance);
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex items-end gap-3">
      <div className="max-w-[240px] rounded-2xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-600 shadow-xl backdrop-blur">
        <p className="font-semibold text-zinc-900">Avatar preview</p>
        <p className="mt-1 line-clamp-3">
          {script.trim() || "Generate a TTS script to preview the talking avatar narration."}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-full bg-[#2e3192] px-2.5 text-[11px] font-semibold text-white"
            onClick={handleSpeak}
            disabled={!script.trim()}
          >
            <Mic className="h-3.5 w-3.5" />
            Speak
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600"
            onClick={() => setMuted((current) => !current)}
            title={muted ? "Unmute preview" : "Mute preview"}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-2xl ring-2 ring-[#2e3192]/20",
          speaking
            ? "bg-gradient-to-br from-[#2e3192] via-[#3d42a8] to-[#f15a24]"
            : "bg-gradient-to-br from-zinc-200 via-white to-zinc-100",
        )}
      >
        <div ref={headRef} className="absolute inset-0" />
        {!avatarReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "h-10 w-10 rounded-full bg-white/85 shadow-inner transition-transform",
                speaking ? "animate-pulse scale-110" : "scale-100",
              )}
            />
          </div>
        )}
        <div className="absolute bottom-2 left-1/2 h-2.5 w-8 -translate-x-1/2 rounded-full bg-white/80" />
      </div>
    </div>
  );
}

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

  const updateSettings = async (patch: Partial<TtsPayload["settings"]>) => {
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
        setError(data.message ?? "Could not save TTS settings.");
        return;
      }
      setPayload(data as TtsPayload);
    } catch {
      setError("Could not save TTS settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(moduleId)}/tts/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Could not generate TTS scripts.");
        return;
      }
      setPayload(data as TtsPayload);
      setActiveSegmentId((data as TtsPayload).segments[0]?.id ?? null);
    } catch {
      setError("Could not generate TTS scripts.");
    } finally {
      setGenerating(false);
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
              Generate and store narration scripts for {moduleTitle}
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Scripts are stored only in isolated <code>tts_course_*</code> tables in Neon.
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

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-900">Feature toggles</p>
            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-zinc-800">Enable TTS</span>
                  <span className="block text-xs text-zinc-500">Store and use generated narration scripts.</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(payload?.settings.ttsEnabled)}
                  onChange={(e) => void updateSettings({ ttsEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-zinc-800">Enable Avatar</span>
                  <span className="block text-xs text-zinc-500">Preview talking head in the bottom-right bubble.</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(payload?.settings.avatarEnabled)}
                  onChange={(e) => void updateSettings({ avatarEnabled: e.target.checked })}
                  disabled={!payload?.settings.ttsEnabled}
                  className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => void handleGenerate()}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Generate TTS scripts
              </Button>
              <Button variant="secondary" onClick={onContinue}>
                <CheckCircle2 className="h-4 w-4" />
                Continue to publish
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-900">Generated beats</p>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {(payload?.segments ?? []).map((segment) => {
                const active = segment.id === activeSegment?.id;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => setActiveSegmentId(segment.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left transition-all",
                      active
                        ? "border-violet-300 bg-violet-50"
                        : "border-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <p className="text-xs font-semibold text-zinc-800">
                      {segment.slideTitle ?? `Step ${segment.stepOrder}`} · Beat {segment.fragmentIndex + 1}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                      {segment.scriptText || segment.rawText}
                    </p>
                  </button>
                );
              })}
              {payload?.segments.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">
                  No TTS script is stored yet. Generate scripts after uploading the HTML lesson/scenario bundle.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-900">Slide preview + avatar bubble</p>
              <p className="text-xs text-zinc-500">
                The avatar preview sits in the bottom-right corner and reads the selected TTS script.
              </p>
            </div>
            <div className="relative h-[460px] bg-[#f8f9fb]">
              {htmlPreviewUrl ? (
                <iframe
                  title="Course HTML preview"
                  src={htmlPreviewUrl}
                  className="absolute inset-0 h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
                  Upload an HTML lesson or scenario to preview slides with TTS.
                </div>
              )}
              <FloatingAvatarPreview
                script={activeSegment?.scriptText ?? ""}
                enabled={Boolean(payload?.settings.avatarEnabled)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Selected script</p>
                <p className="text-xs text-zinc-500">
                  Edit the generated narration before publishing the bundle.
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
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
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

"use client";

import {
  FloatingAvatar,
  haltAllAvatarAudio,
  warmAvatarAssets,
} from "@/components/course/floating-avatar";
import { isSpeakableNarration, sanitizeNarrationSource } from "@/lib/tts-narration";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

type PlaybackSegment = {
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

type PlaybackPayload = {
  available: boolean;
  settings: {
    ttsEnabled: boolean;
    avatarEnabled: boolean;
  };
  segments: PlaybackSegment[];
};

function readBeatFromIframe(iframe: HTMLIFrameElement | null): {
  slideIndex: number;
  fragmentIndex: number;
} | null {
  try {
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    const slides = Array.from(doc.querySelectorAll("section.slide"));
    if (slides.length === 0) return null;
    const activeSlideIndex = slides.findIndex(
      (slide) =>
        slide.classList.contains("present") ||
        slide.classList.contains("active") ||
        slide.getAttribute("aria-hidden") === "false",
    );
    const slideIndex = activeSlideIndex >= 0 ? activeSlideIndex : 0;
    const activeSlide = slides[slideIndex];
    const fragments = Array.from(activeSlide?.querySelectorAll(".fragment") ?? []);
    const fragmentIndex = fragments.findIndex(
      (fragment) =>
        fragment.classList.contains("current-fragment") ||
        fragment.classList.contains("visible") ||
        fragment.classList.contains("active"),
    );
    return {
      slideIndex,
      fragmentIndex: fragmentIndex >= 0 ? fragmentIndex + 1 : 0,
    };
  } catch {
    return null;
  }
}

export function CourseTtsOverlay({
  moduleId,
  stepType,
  iframeRef,
  embedSlideIndex,
}: {
  moduleId: string;
  stepType: string | undefined;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  embedSlideIndex?: number;
}) {
  const [payload, setPayload] = useState<PlaybackPayload | null>(null);
  const [beat, setBeat] = useState({ slideIndex: 0, fragmentIndex: 0 });
  const syncRef = useRef<number | null>(null);

  useEffect(() => {
    // Start GLB + CDN downloads while playback settings are still fetching.
    warmAvatarAssets();
    let cancelled = false;
    void fetch(`/api/courses/${encodeURIComponent(moduleId)}/tts/playback`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        if (data.settings?.avatarEnabled) warmAvatarAssets();
        setPayload({
          available: Boolean(data.available),
          settings: {
            ttsEnabled: Boolean(data.settings?.ttsEnabled),
            avatarEnabled: Boolean(data.settings?.avatarEnabled),
          },
          segments: Array.isArray(data.segments) ? data.segments : [],
        });
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
      haltAllAvatarAudio();
    };
  }, [moduleId]);

  useEffect(() => {
    return () => {
      haltAllAvatarAudio();
    };
  }, []);

  useEffect(() => {
    if (!payload?.available) return;
    const tick = () => {
      const fromDom = readBeatFromIframe(iframeRef.current);
      if (fromDom) {
        setBeat(fromDom);
        return;
      }
      if (typeof embedSlideIndex === "number" && embedSlideIndex >= 0) {
        setBeat((prev) => ({
          slideIndex: embedSlideIndex,
          fragmentIndex: prev.slideIndex === embedSlideIndex ? prev.fragmentIndex : 0,
        }));
      }
    };
    tick();
    syncRef.current = window.setInterval(tick, 250);
    return () => {
      if (syncRef.current != null) {
        window.clearInterval(syncRef.current);
        syncRef.current = null;
      }
    };
  }, [payload?.available, iframeRef, embedSlideIndex]);

  const activeSegment = useMemo(() => {
    if (!payload?.available || !stepType) return null;
    const forStep = payload.segments.filter(
      (segment) =>
        segment.sourceStepType === stepType ||
        (stepType === "pdf" && segment.sourceStepType === "pdf"),
    );
    const pool = forStep.length > 0 ? forStep : payload.segments;
    const exact = pool.find(
        (segment) =>
          segment.slideIndex === beat.slideIndex &&
          segment.fragmentIndex === beat.fragmentIndex,
      );
    const slideLevel = pool.find(
        (segment) =>
          segment.slideIndex === beat.slideIndex && segment.fragmentIndex === 0,
      );
    return exact && isSpeakableNarration(exact.scriptText)
      ? exact
      : slideLevel ?? exact ?? null;
  }, [payload, stepType, beat]);

  if (!payload?.available) return null;
  if (!payload.settings.ttsEnabled && !payload.settings.avatarEnabled) return null;

  const showAvatar = payload.settings.avatarEnabled;
  const reviewedScript = sanitizeNarrationSource(activeSegment?.scriptText ?? "");
  const rawFallback = sanitizeNarrationSource(activeSegment?.rawText ?? "");
  const script = payload.settings.ttsEnabled
    ? isSpeakableNarration(reviewedScript)
      ? reviewedScript
      : isSpeakableNarration(rawFallback)
        ? rawFallback
        : ""
    : reviewedScript;

  // Keep the avatar visible whenever enabled, even if this beat has no script yet.
  if (!showAvatar) return null;

  return (
    <FloatingAvatar
      script={script}
      enabled={showAvatar}
      autoPlay={payload.settings.ttsEnabled && Boolean(script.trim())}
      variant="learner"
    />
  );
}

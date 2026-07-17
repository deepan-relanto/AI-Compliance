"use client";

import { cn } from "@/lib/utils";
import { Loader2, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    webkitSpeechSynthesis?: SpeechSynthesis;
  }
}

type TalkingHeadInstance = {
  showAvatar?: (options: Record<string, unknown>) => Promise<void>;
  speakText?: (text: string, opts?: Record<string, unknown>) => Promise<void> | void;
  speakAudio?: (
    data: unknown,
    options?: Record<string, unknown>,
    onWord?: (word: unknown) => void,
  ) => Promise<void> | void;
  stopSpeaking?: () => void;
  stop?: () => void;
  setMute?: (muted: boolean) => void;
  audioCtx?: AudioContext;
};

type TalkingHeadModule = {
  TalkingHead?: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => TalkingHeadInstance;
};

type HeadTtsMessage = {
  type: "audio" | "error" | "custom";
  data: unknown;
};

type HeadTtsInstance = {
  connect?: () => Promise<void>;
  setup?: (options: Record<string, unknown>) => Promise<unknown>;
  synthesize?: (
    options: { input: string; voice?: string; speed?: number },
    onMessage?: (message: HeadTtsMessage) => void,
    onError?: (error: unknown) => void,
  ) => Promise<HeadTtsMessage[]>;
  clear?: () => void;
};

type HeadTtsModule = {
  HeadTTS?: new (options: Record<string, unknown>) => HeadTtsInstance;
};

/**
 * Kokoro neural voice via HeadTTS. `af_bella` is the pleasant feminine voice
 * used for learner narration. Do not fall back to browser SpeechSynthesis.
 */
const DEFAULT_HEADTTS_VOICE = "af_bella";
const DEFAULT_HEADTTS_SPEED = 1.1;

/** Module-level caches so remounts / slide changes do not re-download CDN + GLB. */
let talkingHeadImportPromise: Promise<TalkingHeadModule> | null = null;
let headTtsImportPromise: Promise<HeadTtsModule> | null = null;
const warmedModelUrls = new Set<string>();

let sharedHeadTts: HeadTtsInstance | null = null;
let sharedHeadTtsVoice: string | null = null;
let sharedHeadTtsPromise: Promise<HeadTtsInstance | null> | null = null;
let sharedAudioCtx: AudioContext | null = null;

/** Live TalkingHead for video-step hard stop only. */
let activeHeadInstance: TalkingHeadInstance | null = null;
let speakEpoch = 0;

/** Stop narration when entering the video step. Keeps instances intact. */
export function haltAllAvatarAudio(): void {
  speakEpoch += 1;
  try {
    activeHeadInstance?.stopSpeaking?.();
  } catch {
    /* ignore */
  }
}

function resumeAudioContext(ctx: AudioContext | null | undefined): void {
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

let gestureResumeInstalled = false;
function installGestureResume(): void {
  if (gestureResumeInstalled || typeof window === "undefined") return;
  gestureResumeInstalled = true;
  const resumeAll = () => {
    resumeAudioContext(sharedAudioCtx);
    resumeAudioContext(activeHeadInstance?.audioCtx);
  };
  window.addEventListener("pointerdown", resumeAll, true);
  window.addEventListener("keydown", resumeAll, true);
}

/**
 * Call from a real user gesture (Begin / Accept rules) so first-slide autoplay
 * is allowed by the browser. Safe to call multiple times.
 */
export function unlockAvatarAudio(): void {
  if (typeof window === "undefined") return;
  installGestureResume();
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    resumeAudioContext(sharedAudioCtx);
    const buffer = sharedAudioCtx.createBuffer(1, 1, sharedAudioCtx.sampleRate);
    const source = sharedAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(sharedAudioCtx.destination);
    source.start(0);
  } catch {
    /* ignore */
  }
  try {
    resumeAudioContext(activeHeadInstance?.audioCtx);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event("avatar-audio-unlocked"));
  } catch {
    /* ignore */
  }
}

export function normalizeTalkingHeadCdnUrl(input: string | undefined): string {
  const bundledFallback = "https://esm.sh/@met4citizen/talkinghead?bundle";
  const raw = input?.trim();
  if (!raw) return bundledFallback;
  if (raw.includes("cdn.jsdelivr.net/npm/@met4citizen/talkinghead")) return bundledFallback;
  return raw;
}

export function normalizeTalkingHeadModelUrl(input: string | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  if (/^[a-zA-Z]:\\/.test(raw)) {
    const fileName = raw.split("\\").pop();
    return fileName ? `/avatars/${fileName}` : null;
  }
  return raw;
}

function loadTalkingHeadModule(cdnUrl: string): Promise<TalkingHeadModule> {
  if (!talkingHeadImportPromise) {
    talkingHeadImportPromise = import(
      /* webpackIgnore: true */ cdnUrl
    ) as Promise<TalkingHeadModule>;
  }
  return talkingHeadImportPromise;
}

function loadHeadTtsModule(cdnUrl: string): Promise<HeadTtsModule> {
  if (!headTtsImportPromise) {
    headTtsImportPromise = import(
      /* webpackIgnore: true */ cdnUrl
    ) as Promise<HeadTtsModule>;
  }
  return headTtsImportPromise;
}

function resolveVoice(): string {
  return process.env.NEXT_PUBLIC_HEADTTS_VOICE?.trim() || DEFAULT_HEADTTS_VOICE;
}

function resolveSpeed(): number {
  const raw = Number(process.env.NEXT_PUBLIC_HEADTTS_SPEED ?? DEFAULT_HEADTTS_SPEED);
  return Number.isFinite(raw) && raw > 0.5 && raw < 2 ? raw : DEFAULT_HEADTTS_SPEED;
}

function defaultHeadTtsCdn(): string {
  return (
    process.env.NEXT_PUBLIC_HEADTTS_CDN_URL?.trim() ||
    "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/+esm"
  );
}

/** Prefetch GLB + HeadTTS so first slide can speak with the AI voice sooner. */
export function warmAvatarAssets(options?: {
  modelUrl?: string | null;
  talkingHeadCdnUrl?: string;
  headTtsCdnUrl?: string;
}): void {
  if (typeof window === "undefined") return;

  const modelUrl =
    options?.modelUrl ??
    normalizeTalkingHeadModelUrl(process.env.NEXT_PUBLIC_TALKINGHEAD_MODEL_URL);
  const talkingHeadCdnUrl = normalizeTalkingHeadCdnUrl(
    options?.talkingHeadCdnUrl ?? process.env.NEXT_PUBLIC_TALKINGHEAD_CDN_URL,
  );
  const headTtsCdnUrl = options?.headTtsCdnUrl?.trim() || defaultHeadTtsCdn();

  void loadTalkingHeadModule(talkingHeadCdnUrl).catch(() => undefined);
  void loadHeadTtsModule(headTtsCdnUrl).catch(() => undefined);
  void ensureSharedHeadTts(headTtsCdnUrl);

  if (!modelUrl || warmedModelUrls.has(modelUrl)) return;
  warmedModelUrls.add(modelUrl);

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "fetch";
  link.href = modelUrl;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);

  void fetch(modelUrl, { credentials: "same-origin", cache: "force-cache" }).catch(
    () => undefined,
  );
}

async function ensureSharedHeadTts(headTtsCdnUrl?: string): Promise<HeadTtsInstance | null> {
  const cdn = headTtsCdnUrl || defaultHeadTtsCdn();
  const voice = resolveVoice();
  if (sharedHeadTts && sharedHeadTtsVoice === voice) return sharedHeadTts;
  if (sharedHeadTtsVoice && sharedHeadTtsVoice !== voice) {
    sharedHeadTts = null;
    sharedHeadTtsPromise = null;
  }
  if (sharedHeadTtsPromise) return sharedHeadTtsPromise;

  sharedHeadTtsPromise = (async (): Promise<HeadTtsInstance | null> => {
    try {
      const { HeadTTS } = await loadHeadTtsModule(cdn);
      if (!HeadTTS) return null;
      const speed = resolveSpeed();
      const headTts = new HeadTTS({
        endpoints: ["webgpu", "wasm"],
        dtypeWasm: "fp16",
        dtypeWebgpu: "fp32",
        workerModule:
          process.env.NEXT_PUBLIC_HEADTTS_WORKER_URL?.trim() ||
          "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/modules/worker-tts.mjs",
        dictionaryURL:
          process.env.NEXT_PUBLIC_HEADTTS_DICTIONARY_URL?.trim() ||
          "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/dictionaries/",
        voices: [voice],
        defaultVoice: voice,
        defaultLanguage: "en-us",
        defaultSpeed: speed,
        splitSentences: true,
      });
      await headTts.connect?.();
      await headTts.setup?.({
        voice,
        language: "en-us",
        speed,
        audioEncoding: "wav",
      });
      sharedHeadTts = headTts;
      sharedHeadTtsVoice = voice;
      return headTts;
    } catch (err) {
      console.error("[avatar] HeadTTS failed to load", err);
      sharedHeadTtsPromise = null;
      return null;
    }
  })();

  return sharedHeadTtsPromise;
}

export type FloatingAvatarProps = {
  script: string;
  enabled: boolean;
  /** Auto-speak when script changes (learner playback). */
  autoPlay?: boolean;
  /** Compact learner chrome without "Avatar preview" copy. */
  variant?: "admin" | "learner";
  className?: string;
};

export function FloatingAvatar({
  script,
  enabled,
  autoPlay = false,
  variant = "admin",
  className,
}: FloatingAvatarProps) {
  const [speaking, setSpeaking] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [showCaption, setShowCaption] = useState(true);
  const [ttsMode, setTtsMode] = useState<"headtts" | "gtts" | "none">("none");
  const headRef = useRef<HTMLDivElement | null>(null);
  const headInstanceRef = useRef<TalkingHeadInstance | null>(null);
  const headTtsRef = useRef<HeadTtsInstance | null>(null);
  const lastAutoScriptRef = useRef<string>("");
  const scriptRef = useRef(script);
  scriptRef.current = script;

  useEffect(() => {
    let cancelled = false;

    const modelUrl = normalizeTalkingHeadModelUrl(process.env.NEXT_PUBLIC_TALKINGHEAD_MODEL_URL);
    const talkingHeadCdnUrl = normalizeTalkingHeadCdnUrl(
      process.env.NEXT_PUBLIC_TALKINGHEAD_CDN_URL,
    );
    const headTtsCdnUrl = defaultHeadTtsCdn();

    if (!enabled || !modelUrl || typeof window === "undefined") {
      setAvatarReady(false);
      setAvatarLoading(false);
      setTtsMode("none");
      return;
    }

    warmAvatarAssets({ modelUrl, talkingHeadCdnUrl, headTtsCdnUrl });
    installGestureResume();
    setAvatarLoading(true);
    setVoiceLoading(true);

    (async () => {
      try {
        const gttsApiKey = process.env.NEXT_PUBLIC_GOOGLE_TTS_API_KEY?.trim();

        // Kick HeadTTS as early as possible - do not race it against a browser fallback.
        const headTtsWarm = gttsApiKey
          ? Promise.resolve(null)
          : ensureSharedHeadTts(headTtsCdnUrl);

        const { TalkingHead } = await loadTalkingHeadModule(talkingHeadCdnUrl);
        if (cancelled || !headRef.current || !TalkingHead) return;

        const gttsVoice =
          process.env.NEXT_PUBLIC_GOOGLE_TTS_VOICE?.trim() || "en-US-Neural2-F";
        const gttsLang = process.env.NEXT_PUBLIC_GOOGLE_TTS_LANG?.trim() || "en-US";

        const headOptions: Record<string, unknown> = {
          cameraView: "head",
          avatarMood: "neutral",
          avatarMute: false,
          lipsyncModules: [],
        };
        if (gttsApiKey) {
          headOptions.ttsEndpoint =
            "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
          headOptions.ttsApikey = gttsApiKey;
          headOptions.ttsLang = gttsLang;
          headOptions.ttsVoice = gttsVoice;
          headOptions.ttsRate = 1;
          headOptions.ttsPitch = 0;
        }

        const head = new TalkingHead(headRef.current, headOptions);

        if (typeof head.showAvatar === "function") {
          await head.showAvatar({
            url: modelUrl,
            body: "F",
            avatarMood: "neutral",
          });
        }

        if (cancelled) {
          if (typeof head.stop === "function") head.stop();
          return;
        }

        resumeAudioContext(head.audioCtx);
        headInstanceRef.current = head;
        activeHeadInstance = head;
        setAvatarReady(true);
        setAvatarLoading(false);

        if (gttsApiKey) {
          setTtsMode("gtts");
          setVoiceLoading(false);
          return;
        }

        // Wait for the Kokoro / HeadTTS engine - this IS the voice product.
        const headTts = await headTtsWarm;
        if (cancelled) return;
        if (headTts?.synthesize) {
          headTtsRef.current = headTts;
          setTtsMode("headtts");
        } else {
          console.error("[avatar] HeadTTS unavailable - AI voice cannot start");
          setTtsMode("none");
        }
        setVoiceLoading(false);
      } catch (err) {
        console.error("[avatar] TalkingHead init failed", err);
        if (!cancelled) {
          setAvatarReady(false);
          setAvatarLoading(false);
          setVoiceLoading(false);
          // Still try to get HeadTTS so we can play AI audio without the 3D head.
          try {
            const headTts = await ensureSharedHeadTts(headTtsCdnUrl);
            if (!cancelled && headTts?.synthesize) {
              headTtsRef.current = headTts;
              setTtsMode("headtts");
            } else {
              setTtsMode("none");
            }
          } catch {
            setTtsMode("none");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      speakEpoch += 1;
      const head = headInstanceRef.current;
      try {
        head?.stopSpeaking?.();
      } catch {
        /* ignore */
      }
      if (activeHeadInstance === headInstanceRef.current) activeHeadInstance = null;
      if (typeof head?.stop === "function") head.stop();
      headInstanceRef.current = null;
      headTtsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const stopSpeaking = () => {
    speakEpoch += 1;
    const head = headInstanceRef.current;
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    setSpeaking(false);
  };

  const handleSpeak = async (opts?: { force?: boolean }) => {
    const text = scriptRef.current.trim();
    if (!text) return;
    if (speaking && !opts?.force) {
      stopSpeaking();
      return;
    }

    speakEpoch += 1;
    const epoch = speakEpoch;

    unlockAvatarAudio();
    const head = headInstanceRef.current;
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();

    try {
      if (head?.audioCtx?.state === "suspended") {
        await head.audioCtx.resume();
      }
      if (sharedAudioCtx?.state === "suspended") {
        await sharedAudioCtx.resume();
      }
    } catch {
      /* ignore */
    }

    // Google TTS path only when explicitly configured.
    if (ttsMode === "gtts" && avatarReady && typeof head?.speakText === "function") {
      try {
        setSpeaking(true);
        await Promise.resolve(head.speakText(text));
      } catch (err) {
        console.error("[avatar] Google TTS speak failed", err);
      } finally {
        if (epoch === speakEpoch) setSpeaking(false);
      }
      return;
    }

    // Resolve / wait for Kokoro HeadTTS - never use browser SpeechSynthesis.
    let engine = headTtsRef.current;
    if (!engine?.synthesize) {
      setVoiceLoading(true);
      engine = (await ensureSharedHeadTts()) ?? null;
      setVoiceLoading(false);
      if (engine?.synthesize) {
        headTtsRef.current = engine;
        setTtsMode("headtts");
      }
    }
    if (!engine?.synthesize) {
      console.error("[avatar] AI voice engine not ready");
      return;
    }

    try {
      setSpeaking(true);
      const messages = await engine.synthesize({
        input: text.slice(0, 500),
      });
      if (epoch !== speakEpoch) return;
      for (const message of messages ?? []) {
        if (epoch !== speakEpoch) return;
        if (message.type === "error") {
          throw new Error("HeadTTS synthesis failed");
        }
        if (message.type === "audio") {
          if (!head || typeof head.speakAudio !== "function") {
            throw new Error("TalkingHead audio player unavailable");
          }
          await Promise.resolve(head.speakAudio(message.data));
        }
      }
    } catch (err) {
      console.error("[avatar] AI voice playback failed", err);
    } finally {
      if (epoch === speakEpoch) setSpeaking(false);
    }
  };

  useEffect(() => {
    if (!autoPlay || !enabled || !script.trim()) return;
    // Only autoplay once the AI voice (HeadTTS) or Google TTS is ready.
    if (avatarLoading || voiceLoading || ttsMode === "none") return;
    if (script === lastAutoScriptRef.current) return;

    let cancelled = false;
    let kickedOff = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      kickedOff = true;
      lastAutoScriptRef.current = script;
      void handleSpeak({ force: true });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (!kickedOff && lastAutoScriptRef.current === script) {
        lastAutoScriptRef.current = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, enabled, script, avatarReady, avatarLoading, voiceLoading, ttsMode]);

  useEffect(() => {
    return () => {
      lastAutoScriptRef.current = "";
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = avatarLoading || voiceLoading;
  const statusLabel =
    !enabled
      ? "Enable avatar in settings to activate."
      : voiceLoading
        ? "Loading AI voice (Kokoro)..."
        : avatarLoading
          ? "Loading avatar model..."
          : ttsMode === "headtts"
            ? `AI voice ready (${resolveVoice()}).`
            : ttsMode === "gtts"
              ? "Google TTS active."
              : "AI voice unavailable.";

  return (
    <div
      className={cn(
        "pointer-events-auto z-[80] flex max-w-[min(300px,calc(100vw-1.5rem))] items-end gap-2",
        variant === "learner"
          ? "fixed bottom-20 right-3 sm:bottom-[4.5rem]"
          : "absolute bottom-3 right-3 z-20",
        className,
      )}
    >
      {showCaption && (
        <div className="max-w-[230px] rounded-2xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-600 shadow-xl backdrop-blur">
          <p className="font-semibold text-zinc-900">
            {variant === "learner" ? "Narrator" : "Avatar preview"}
          </p>
          <p className="mt-1 line-clamp-3">
            {script.trim() ||
              (variant === "learner"
                ? "Narration will play when a script is available for this slide."
                : "Generate a TTS script to preview the talking avatar narration.")}
          </p>
          {(variant === "admin" || voiceLoading || ttsMode === "none") && (
            <p className="mt-1 text-[11px] text-zinc-500">{statusLabel}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white transition-colors",
                speaking ? "bg-red-500" : "bg-[#2e3192] hover:bg-[#3d42a8]",
              )}
              onClick={() => void handleSpeak()}
              disabled={!script.trim() || busy || ttsMode === "none"}
            >
              <Mic className="h-3.5 w-3.5" />
              {speaking ? "Stop" : busy ? "Loading?" : "Speak"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-pressed={!showCaption}
        aria-label={showCaption ? "Hide narrator text" : "Show narrator text"}
        title={showCaption ? "Hide narrator text" : "Show narrator text"}
        onClick={() => setShowCaption((visible) => !visible)}
        className={cn(
          "relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full border-4 shadow-2xl transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2e3192]/45",
          speaking
            ? "border-white ring-2 ring-[#f15a24]/70 bg-gradient-to-br from-[#2e3192] via-[#3d42a8] to-[#f15a24]"
            : "border-zinc-300 ring-1 ring-zinc-300/60 bg-zinc-200",
        )}
      >
        <div
          ref={headRef}
          className={cn(
            "absolute inset-0 transition-[filter,opacity] duration-200",
            speaking ? "grayscale-0 opacity-100" : "grayscale opacity-70",
          )}
        />
        {(busy || !avatarReady) && (
          <div className="absolute inset-0 flex items-center justify-center">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]/60" />
            ) : (
              <div
                className={cn(
                  "h-10 w-10 rounded-full bg-white/85 shadow-inner transition-transform",
                  speaking ? "animate-pulse scale-110" : "scale-100",
                )}
              />
            )}
          </div>
        )}
        <div className="absolute bottom-2 left-1/2 h-2.5 w-8 -translate-x-1/2 rounded-full bg-white/80" />
      </button>
    </div>
  );
}

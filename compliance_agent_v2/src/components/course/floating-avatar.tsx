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
    options: { input: string },
    onMessage?: (message: HeadTtsMessage) => void,
    onError?: (error: unknown) => void,
  ) => Promise<HeadTtsMessage[]>;
  clear?: () => void;
};

type HeadTtsModule = {
  HeadTTS?: new (options: Record<string, unknown>) => HeadTtsInstance;
};

const DEFAULT_HEADTTS_VOICE = "af_nicole";

/** Module-level caches so remounts / slide changes do not re-download CDN + GLB. */
let talkingHeadImportPromise: Promise<TalkingHeadModule> | null = null;
let headTtsImportPromise: Promise<HeadTtsModule> | null = null;
const warmedModelUrls = new Set<string>();

/** Live instances ? used only for video-step hard stop. Do not tear down mid-slide. */
let activeHeadInstance: TalkingHeadInstance | null = null;
let activeHeadTts: HeadTtsInstance | null = null;

/** Stop narration when entering the video step. Keeps the avatar instance intact. */
export function haltAllAvatarAudio(): void {
  try {
    getSpeechEngine()?.cancel();
  } catch {
    /* ignore */
  }
  try {
    activeHeadInstance?.stopSpeaking?.();
  } catch {
    /* ignore */
  }
  try {
    activeHeadTts?.clear?.();
  } catch {
    /* ignore */
  }
}

function getSpeechEngine(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? window.webkitSpeechSynthesis ?? null;
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

/** Prefetch the GLB (+ CDN modules) so the avatar circle fills faster on first show. */
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
  const headTtsCdnUrl =
    options?.headTtsCdnUrl?.trim() ||
    process.env.NEXT_PUBLIC_HEADTTS_CDN_URL?.trim() ||
    "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/+esm";

  void loadTalkingHeadModule(talkingHeadCdnUrl).catch(() => undefined);
  void loadHeadTtsModule(headTtsCdnUrl).catch(() => undefined);

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

function createFakeTalkingAudio(
  script: string,
  audioCtx: AudioContext,
): {
  audio: AudioBuffer;
  words: string[];
  wtimes: number[];
  wdurations: number[];
  visemes: string[];
  vtimes: number[];
  vdurations: number[];
} {
  const words = script.split(/\s+/).filter(Boolean);
  const visemeList = [
    "aa",
    "E",
    "I",
    "O",
    "U",
    "PP",
    "FF",
    "TH",
    "DD",
    "kk",
    "CH",
    "SS",
    "nn",
    "RR",
  ];

  const wtimes: number[] = [];
  const wdurations: number[] = [];
  const visemes: string[] = [];
  const vtimes: number[] = [];
  const vdurations: number[] = [];

  let currentMs = 0;

  for (const word of words) {
    const wordDur = Math.max(150, word.length * 15 + 100);
    wtimes.push(currentMs);
    wdurations.push(wordDur);

    const visemeDur = wordDur / 2;
    visemes.push(visemeList[Math.floor(Math.random() * visemeList.length)]);
    vtimes.push(currentMs);
    vdurations.push(visemeDur);
    visemes.push(visemeList[Math.floor(Math.random() * visemeList.length)]);
    vtimes.push(currentMs + visemeDur);
    vdurations.push(visemeDur);

    currentMs += wordDur + 50;
  }

  const durationSecs = currentMs / 1000;
  const sampleRate = audioCtx.sampleRate || 44100;
  const buffer = audioCtx.createBuffer(
    1,
    Math.max(1, Math.ceil(sampleRate * durationSecs)),
    sampleRate,
  );

  return {
    audio: buffer,
    words,
    wtimes,
    wdurations,
    visemes,
    vtimes,
    vdurations,
  };
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
  const [showCaption, setShowCaption] = useState(true);
  const [ttsMode, setTtsMode] = useState<"headtts" | "gtts" | "browser" | "none">(
    "none",
  );
  const headRef = useRef<HTMLDivElement | null>(null);
  const headInstanceRef = useRef<TalkingHeadInstance | null>(null);
  const headTtsRef = useRef<HeadTtsInstance | null>(null);
  const lastAutoScriptRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;

    const modelUrl = normalizeTalkingHeadModelUrl(process.env.NEXT_PUBLIC_TALKINGHEAD_MODEL_URL);
    const talkingHeadCdnUrl = normalizeTalkingHeadCdnUrl(
      process.env.NEXT_PUBLIC_TALKINGHEAD_CDN_URL,
    );
    const headTtsCdnUrl =
      process.env.NEXT_PUBLIC_HEADTTS_CDN_URL?.trim() ||
      "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/+esm";

    if (!enabled || !modelUrl || typeof window === "undefined") {
      setAvatarReady(false);
      setAvatarLoading(false);
      setTtsMode("none");
      return;
    }

    warmAvatarAssets({ modelUrl, talkingHeadCdnUrl, headTtsCdnUrl });
    setAvatarLoading(true);

    (async () => {
      try {
        // Kick HeadTTS warm-up in parallel with the 3D model load.
        const headTtsWarm = (async (): Promise<HeadTtsInstance | null> => {
          const gttsApiKey = process.env.NEXT_PUBLIC_GOOGLE_TTS_API_KEY?.trim();
          if (gttsApiKey) return null;
          try {
            const { HeadTTS } = await loadHeadTtsModule(headTtsCdnUrl);
            if (!HeadTTS || cancelled) return null;
            const voice =
              process.env.NEXT_PUBLIC_HEADTTS_VOICE?.trim() || DEFAULT_HEADTTS_VOICE;
            const headTts = new HeadTTS({
              endpoints: ["webgpu", "wasm"],
              dtypeWebgpu: "fp32",
              dtypeWasm: "fp16",
              workerModule:
                process.env.NEXT_PUBLIC_HEADTTS_WORKER_URL?.trim() ||
                "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/modules/worker-tts.mjs",
              dictionaryURL:
                process.env.NEXT_PUBLIC_HEADTTS_DICTIONARY_URL?.trim() ||
                "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/dictionaries/",
              voices: [voice],
              defaultVoice: voice,
              defaultLanguage: "en-us",
              defaultSpeed: 1,
              splitSentences: true,
            });
            await headTts.connect?.();
            await headTts.setup?.({
              voice,
              language: "en-us",
              speed: 1,
              audioEncoding: "wav",
            });
            return cancelled ? null : headTts;
          } catch {
            return null;
          }
        })();

        const { TalkingHead } = await loadTalkingHeadModule(talkingHeadCdnUrl);
        if (cancelled || !headRef.current || !TalkingHead) return;

        const gttsApiKey = process.env.NEXT_PUBLIC_GOOGLE_TTS_API_KEY?.trim();
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

        headInstanceRef.current = head;
        activeHeadInstance = head;
        setAvatarReady(true);
        setAvatarLoading(false);

        if (gttsApiKey) {
          setTtsMode("gtts");
          return;
        }

        const headTts = await headTtsWarm;
        if (cancelled) {
          headTts?.clear?.();
          return;
        }
        if (headTts) {
          headTtsRef.current = headTts;
          activeHeadTts = headTts;
          setTtsMode("headtts");
        } else {
          setTtsMode("browser");
        }
      } catch {
        if (!cancelled) {
          setAvatarReady(false);
          setAvatarLoading(false);
          setTtsMode("none");
        }
      }
    })();

    return () => {
      cancelled = true;
      const head = headInstanceRef.current;
      if (typeof head?.stop === "function") head.stop();
      headTtsRef.current?.clear?.();
      if (activeHeadTts === headTtsRef.current) activeHeadTts = null;
      if (activeHeadInstance === headInstanceRef.current) activeHeadInstance = null;
      headTtsRef.current = null;
      headInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const stopSpeaking = () => {
    const head = headInstanceRef.current;
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    const synth = getSpeechEngine();
    synth?.cancel();
    headTtsRef.current?.clear?.();
    setSpeaking(false);
  };

  const handleFallbackSpeak = () => {
    const synth = getSpeechEngine();
    const head = headInstanceRef.current;
    if (!synth || !script.trim()) return;
    synth.cancel();
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(script.trim());
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = synth.getVoices();
    utterance.voice =
      voices.find(
        (voice) =>
          /^en[-_]/i.test(voice.lang) &&
          /(samantha|zira|aria|jenny|natural|neural|female)/i.test(voice.name),
      ) ??
      voices.find((voice) => /^en[-_](US|GB)/i.test(voice.lang)) ??
      null;
    utterance.onstart = () => {
      setSpeaking(true);
      if (head && typeof head.speakAudio === "function") {
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = head.audioCtx || new AudioCtx();
          const fakeAudio = createFakeTalkingAudio(script.trim(), audioCtx);
          head.speakAudio(fakeAudio);
        } catch (e) {
          console.error("Failed to start fake lip sync:", e);
        }
      }
    };
    utterance.onend = () => {
      setSpeaking(false);
      if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    };
    synth.speak(utterance);
  };

  const handleSpeak = async (opts?: { force?: boolean }) => {
    if (!script.trim()) return;
    if (speaking && !opts?.force) {
      stopSpeaking();
      return;
    }

    const head = headInstanceRef.current;
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    getSpeechEngine()?.cancel();

    if (
      ttsMode === "headtts" &&
      avatarReady &&
      headTtsRef.current?.synthesize &&
      typeof head?.speakAudio === "function"
    ) {
      try {
        setSpeaking(true);
        const messages = await headTtsRef.current.synthesize({
          input: script.trim().slice(0, 500),
        });
        for (const message of messages ?? []) {
          if (message.type === "error") throw new Error("HeadTTS synthesis failed");
          if (message.type === "audio") {
            await Promise.resolve(head.speakAudio(message.data));
          }
        }
        return;
      } catch {
        setTtsMode("browser");
        handleFallbackSpeak();
        return;
      } finally {
        setSpeaking(false);
      }
    }

    if (ttsMode === "gtts" && avatarReady && typeof head?.speakText === "function") {
      try {
        setSpeaking(true);
        await Promise.resolve(head.speakText(script.trim()));
      } catch {
        // ignore
      } finally {
        setSpeaking(false);
      }
      return;
    }

    handleFallbackSpeak();
  };

  useEffect(() => {
    if (!autoPlay || !enabled || !script.trim()) return;
    if (script === lastAutoScriptRef.current) return;
    if (avatarLoading) return;
    lastAutoScriptRef.current = script;
    stopSpeaking();
    const timer = window.setTimeout(() => {
      void handleSpeak({ force: true });
    }, 50);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, enabled, script, avatarReady, avatarLoading, ttsMode]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const statusLabel =
    !enabled
      ? "Enable avatar in settings to activate."
      : avatarLoading
        ? "Loading avatar model…"
        : !avatarReady
          ? "Using fallback preview — avatar model unavailable."
          : ttsMode === "gtts"
            ? "Google TTS · TalkingHead lip-sync active."
            : ttsMode === "headtts"
              ? "Neural HeadTTS · TalkingHead lip-sync active."
              : "TalkingHead avatar ready.";

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-3 right-3 z-20 flex max-w-[calc(100%-1.5rem)] items-end gap-3",
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
          {variant === "admin" && (
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
              disabled={!script.trim() || avatarLoading}
            >
              <Mic className="h-3.5 w-3.5" />
              {speaking ? "Stop" : "Speak"}
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
          "relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full border-4 border-white shadow-2xl ring-2 ring-[#2e3192]/20 transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2e3192]/45",
          speaking
            ? "bg-gradient-to-br from-[#2e3192] via-[#3d42a8] to-[#f15a24]"
            : "bg-gradient-to-br from-zinc-200 via-white to-zinc-100",
        )}
      >
        <div ref={headRef} className="absolute inset-0" />
        {(avatarLoading || !avatarReady) && (
          <div className="absolute inset-0 flex items-center justify-center">
            {avatarLoading ? (
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

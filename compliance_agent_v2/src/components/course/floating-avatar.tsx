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

/** Feminine Kokoro voice; preferred path. Browser TTS is last-resort only. */
const DEFAULT_HEADTTS_VOICE = "af_bella";
const DEFAULT_HEADTTS_SPEED = 1.1;
/** If Kokoro has not connected by then, speak with browser so the session is never silent. */
const HEADTTS_READY_TIMEOUT_MS = 12000;

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
let activeDirectSources: AudioBufferSourceNode[] = [];

function getSpeechEngine(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? window.webkitSpeechSynthesis ?? null;
}

function stopDirectAudioSources(): void {
  for (const source of activeDirectSources) {
    try {
      source.stop();
    } catch {
      /* ignore */
    }
  }
  activeDirectSources = [];
}

/** Stop narration when entering the video step. Keeps instances intact. */
export function haltAllAvatarAudio(): void {
  speakEpoch += 1;
  stopDirectAudioSources();
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
    getSpeechEngine()?.getVoices();
  } catch {
    /* ignore */
  }
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

/** Prefetch GLB + HeadTTS so first slide can speak sooner. */
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
      // Wasm-first: more reliable on locked-down laptops than WebGPU-first.
      const headTts = new HeadTTS({
        endpoints: ["wasm", "webgpu"],
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

function getPlaybackAudioContext(head: TalkingHeadInstance | null): AudioContext | null {
  if (head?.audioCtx) return head.audioCtx;
  if (sharedAudioCtx) return sharedAudioCtx;
  if (typeof window === "undefined") return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

async function playHeadTtsPayloadDirect(
  data: unknown,
  head: TalkingHeadInstance | null,
  epoch: number,
): Promise<void> {
  if (epoch !== speakEpoch) return;
  const payload = data as { audio?: ArrayBuffer | AudioBuffer | ArrayBufferView };
  const audioCtx = getPlaybackAudioContext(head);
  if (!audioCtx) throw new Error("No AudioContext for direct playback");
  resumeAudioContext(audioCtx);
  if (audioCtx.state === "suspended") {
    await audioCtx.resume().catch(() => undefined);
  }

  let buffer: AudioBuffer | null =
    payload.audio instanceof AudioBuffer ? payload.audio : null;
  if (!buffer && payload.audio) {
    try {
      if (payload.audio instanceof ArrayBuffer) {
        buffer = await audioCtx.decodeAudioData(payload.audio.slice(0));
      } else if (ArrayBuffer.isView(payload.audio)) {
        const view = payload.audio;
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        buffer = await audioCtx.decodeAudioData(bytes.slice().buffer);
      }
    } catch (err) {
      console.error("[avatar] Failed to decode HeadTTS WAV", err);
      throw err;
    }
  }
  if (!buffer) throw new Error("HeadTTS payload has no decodable audio");

  await new Promise<void>((resolve, reject) => {
    if (epoch !== speakEpoch) {
      resolve();
      return;
    }
    try {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      activeDirectSources.push(source);
      source.onended = () => {
        activeDirectSources = activeDirectSources.filter((s) => s !== source);
        resolve();
      };
      source.start(0);
    } catch (err) {
      reject(err);
    }
  });
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
  return { audio: buffer, words, wtimes, wdurations, visemes, vtimes, vdurations };
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

    (async () => {
      try {
        const gttsApiKey = process.env.NEXT_PUBLIC_GOOGLE_TTS_API_KEY?.trim();
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
          return;
        }

        // Allow autoplay immediately (browser last-resort) while Kokoro finishes warming.
        if (sharedHeadTts?.synthesize) {
          headTtsRef.current = sharedHeadTts;
          setTtsMode("headtts");
        } else {
          setTtsMode("browser");
        }

        const TIMEOUT = Symbol("headtts-timeout");
        const raced = await Promise.race([
          headTtsWarm,
          new Promise<typeof TIMEOUT>((resolve) =>
            window.setTimeout(() => resolve(TIMEOUT), HEADTTS_READY_TIMEOUT_MS),
          ),
        ]);
        if (cancelled) return;

        if (raced !== TIMEOUT && raced?.synthesize) {
          headTtsRef.current = raced;
          setTtsMode("headtts");
        } else if (raced === TIMEOUT) {
          void headTtsWarm.then((late) => {
            if (cancelled || !late?.synthesize) return;
            headTtsRef.current = late;
            setTtsMode("headtts");
          });
        }
      } catch (err) {
        console.error("[avatar] TalkingHead init failed", err);
        if (!cancelled) {
          setAvatarReady(false);
          setAvatarLoading(false);
          setTtsMode("browser");
        }
      }
    })();

    return () => {
      cancelled = true;
      speakEpoch += 1;
      stopDirectAudioSources();
      const head = headInstanceRef.current;
      try {
        head?.stopSpeaking?.();
      } catch {
        /* ignore */
      }
      if (activeHeadInstance === headInstanceRef.current) activeHeadInstance = null;
      if (typeof head?.stop === "function") head.stop();
      headInstanceRef.current = null;
      // Keep shared HeadTTS warm across remounts; only drop this mount's ref.
      headTtsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const stopSpeaking = () => {
    speakEpoch += 1;
    stopDirectAudioSources();
    const head = headInstanceRef.current;
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    getSpeechEngine()?.cancel();
    setSpeaking(false);
  };

  const handleFallbackSpeak = (epoch: number) => {
    const synth = getSpeechEngine();
    const head = headInstanceRef.current;
    const text = scriptRef.current.trim();
    if (!synth || !text) return;
    synth.cancel();
    if (typeof head?.stopSpeaking === "function") head.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.05;
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
      if (epoch !== speakEpoch) return;
      setSpeaking(true);
      if (head && typeof head.speakAudio === "function") {
        try {
          const audioCtx = getPlaybackAudioContext(head);
          if (audioCtx) {
            head.speakAudio(createFakeTalkingAudio(text, audioCtx));
          }
        } catch {
          /* ignore */
        }
      }
    };
    const keepAlive = window.setInterval(() => {
      if (epoch !== speakEpoch) {
        window.clearInterval(keepAlive);
        return;
      }
      if (synth.paused) synth.resume();
    }, 3000);
    const finish = () => {
      window.clearInterval(keepAlive);
      if (epoch !== speakEpoch) return;
      setSpeaking(false);
      if (typeof head?.stopSpeaking === "function") head.stopSpeaking();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
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
    getSpeechEngine()?.cancel();
    stopDirectAudioSources();

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

    // Prefer HeadTTS when available (or still loading ? try resolve once).
    let engine = headTtsRef.current ?? sharedHeadTts;
    if (!engine?.synthesize && ttsMode !== "browser") {
      engine = (await ensureSharedHeadTts()) ?? null;
      if (engine?.synthesize) {
        headTtsRef.current = engine;
        setTtsMode("headtts");
      }
    }

    if (engine?.synthesize) {
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
            // Proven contract from 9cb268c: pass message.data through unchanged.
            if (head && typeof head.speakAudio === "function") {
              try {
                await Promise.resolve(head.speakAudio(message.data));
                continue;
              } catch (err) {
                console.warn("[avatar] speakAudio failed; playing Kokoro WAV directly", err);
              }
            }
            await playHeadTtsPayloadDirect(message.data, head, epoch);
          }
        }
        return;
      } catch (err) {
        console.error("[avatar] HeadTTS speak failed; falling back to browser", err);
        if (epoch !== speakEpoch) return;
        setTtsMode("browser");
        handleFallbackSpeak(epoch);
        return;
      } finally {
        if (epoch === speakEpoch) setSpeaking(false);
      }
    }

    // Last resort: never leave the learner in silence.
    handleFallbackSpeak(epoch);
  };

  useEffect(() => {
    if (!autoPlay || !enabled || !script.trim()) return;
    // Match 9cb268c: autoplay once avatar load finishes ? do not wait forever on Kokoro.
    if (avatarLoading) return;
    if (ttsMode === "none") return;
    if (script === lastAutoScriptRef.current) return;

    let cancelled = false;
    let kickedOff = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      kickedOff = true;
      lastAutoScriptRef.current = script;
      void handleSpeak({ force: true });
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (!kickedOff && lastAutoScriptRef.current === script) {
        lastAutoScriptRef.current = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, enabled, script, avatarReady, avatarLoading, ttsMode]);

  useEffect(() => {
    return () => {
      lastAutoScriptRef.current = "";
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel =
    !enabled
      ? "Enable avatar in settings to activate."
      : avatarLoading
        ? "Loading avatar model..."
        : ttsMode === "headtts"
          ? `AI voice ready (${resolveVoice()}).`
          : ttsMode === "gtts"
            ? "Google TTS active."
            : ttsMode === "browser"
              ? "Backup voice ready (AI still warming)."
              : "Preparing narration...";

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
              {speaking ? "Stop" : avatarLoading ? "Loading..." : "Speak"}
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

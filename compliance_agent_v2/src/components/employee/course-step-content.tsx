"use client";

import {
  COURSE_STEP_LABELS,
  isHtmlCourseAsset,
  type CourseStepRow,
  type CourseStepType,
} from "@/lib/course-step-types";
import { clientCourseAssetUrl } from "@/lib/course-asset-url";
import { withEmbedQuery } from "@/lib/course-embed";
import { MindMapPlayground } from "@/components/employee/mind-map-playground";
import { FileCode2, FileText, Loader2, Network, Video, Image as ImageIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PdfPageViewer = dynamic(
  () => import("@/components/employee/pdf-page-viewer").then((m) => m.PdfPageViewer),
  { ssr: false },
);

const STEP_ICONS: Record<CourseStepType, typeof FileText> = {
  pdf: FileCode2,
  video: Video,
  mindmap: Network,
  infographic: ImageIcon,
  quiz: FileText,
};

const EMBED_SIZE_FIX_CSS = `
html, body { height: 100% !important; margin: 0 !important; overflow: hidden !important; }
body.embed .deck-shell {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
body.embed .deck-shell > .deck,
body.embed .deck {
  position: relative !important;
  flex-shrink: 0 !important;
  width: min(100%, calc(100% * 16 / 9)) !important;
  height: min(100%, calc(100% * 9 / 16)) !important;
  max-width: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  transform-origin: center center !important;
  overflow: hidden !important;
}
body.embed .slide {
  overflow: auto !important;
  box-sizing: border-box !important;
  padding: 18px 24px 36px !important;
}
body.embed .flow { margin-top: 10px !important; gap: 6px !important; }
body.embed .flow-step { min-height: 0 !important; padding: 8px 10px !important; font-size: 13px !important; }
body.embed .content { margin-top: 8px !important; }
body.embed .grid { gap: 8px !important; }
body.embed .card { padding: 8px 10px !important; }
body.embed .card h3, body.embed .card strong { font-size: 14px !important; }
body.embed .card p, body.embed .card li { font-size: 12px !important; line-height: 1.35 !important; }
body.embed .journey { margin-top: 10px !important; gap: 6px !important; }
body.embed .journey-step { min-height: 0 !important; padding: 8px !important; }
body.embed h1 { font-size: clamp(16px, 2.4vw, 26px) !important; margin-bottom: 8px !important; }
body.embed .kicker { margin-bottom: 4px !important; }
body.embed .footer { left: 24px !important; right: 24px !important; bottom: 10px !important; font-size: 11px !important; }
`;

const EMBED_FIT_SCRIPT = `(function(){
  function isEmbed(){try{return new URLSearchParams(location.search).get("embed")==="1"||document.body.classList.contains("embed");}catch(e){return false;}}
  if(!isEmbed())return;
  function fitEmbedDeck(){
    var shell=document.querySelector(".deck-shell");
    var deck=shell&&(shell.querySelector(".deck")||document.querySelector(".deck"));
    if(!shell||!deck)return;
    deck.style.transform="none";
    deck.querySelectorAll(".slide").forEach(function(s){
      s.style.zoom="";
      s.style.transform="";
    });
    var sw=shell.clientWidth,sh=shell.clientHeight;
    if(sw<1||sh<1)return;
    var dw=deck.offsetWidth,dh=deck.offsetHeight;
    if(dw<1||dh<1)return;
    var scale=Math.min(sw/dw,sh/dh,1);
    var active=deck.querySelector(".slide.active");
    if(active){
      var ch=active.clientHeight;
      var contentH=active.scrollHeight;
      if(ch>0&&contentH>ch+2){
        var z=Math.max(0.55, ch/contentH);
        active.style.zoom=String(z);
        if(active.scrollHeight>active.clientHeight+2){
          active.style.overflow="auto";
        }
      }
    }
    deck.style.transform="scale("+scale+")";
    deck.style.transformOrigin="center center";
  }
  window.relantoFitEmbedDeck=fitEmbedDeck;
  window.addEventListener("resize",fitEmbedDeck);
  function schedule(){setTimeout(fitEmbedDeck,0);setTimeout(fitEmbedDeck,150);setTimeout(fitEmbedDeck,400);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);
  else schedule();
  try{
    var deck=document.querySelector(".deck");
    if(deck)new MutationObserver(fitEmbedDeck).observe(deck,{attributes:true,subtree:true,attributeFilter:["class"]});
    var shell=document.querySelector(".deck-shell");
    if(shell&&typeof ResizeObserver!=="undefined")new ResizeObserver(fitEmbedDeck).observe(shell);
  }catch(e){}
})();`;

function injectEmbedSizeFix(iframe: HTMLIFrameElement | null) {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc?.head) return;
    let style = doc.getElementById("relanto-embed-size-fix");
    if (!style) {
      style = doc.createElement("style");
      style.id = "relanto-embed-size-fix";
      doc.head.appendChild(style);
    }
    style.textContent = EMBED_SIZE_FIX_CSS;
    if (!doc.getElementById("relanto-embed-fit")) {
      const script = doc.createElement("script");
      script.id = "relanto-embed-fit";
      script.textContent = EMBED_FIT_SCRIPT;
      doc.body.appendChild(script);
    } else {
      const win = doc.defaultView as (Window & { relantoFitEmbedDeck?: () => void }) | null;
      if (typeof win?.relantoFitEmbedDeck === "function") {
        win.relantoFitEmbedDeck();
      }
    }
  } catch {
    /* cross-origin — ignore */
  }
}

function HtmlEmbed({
  url,
  title,
  eyebrow,
  chrome = true,
  iframeRef,
}: {
  url: string;
  title?: string;
  eyebrow: string;
  chrome?: boolean;
  iframeRef?: React.Ref<HTMLIFrameElement>;
}) {
  const embedUrl = withEmbedQuery(url) ?? url;
  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    injectEmbedSizeFix(e.currentTarget);
  };

  if (!chrome) {
    return (
      <div className="relative mx-auto flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f8f9fb]">
        <iframe
          ref={iframeRef}
          key={embedUrl}
          src={embedUrl}
          title={title ?? eyebrow}
          className="absolute inset-0 h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={handleIframeLoad}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(100%,96vw)] flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 shadow-2xl">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <FileCode2 className="h-4 w-4 text-[#f15a24]" />
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
          {eyebrow}
        </p>
        {title && (
          <span className="max-w-[min(40vw,280px)] truncate text-xs text-zinc-400">
            {title}
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          ref={iframeRef}
          key={embedUrl}
          src={embedUrl}
          title={title ?? eyebrow}
          className="absolute inset-0 h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}

export function CourseStepContent({
  step,
  pdfPage,
  pdfPages,
  moduleTitle,
  onPdfPages,
  htmlIframeRef,
}: {
  step: CourseStepRow;
  pdfPage: number;
  pdfPages: number;
  moduleTitle: string;
  onPdfPages: (n: number) => void;
  htmlIframeRef?: React.Ref<HTMLIFrameElement>;
}) {
  const Icon = STEP_ICONS[step.stepType];
  const url = clientCourseAssetUrl(step.config.assetUrl);
  const htmlAsset = isHtmlCourseAsset(
    step.config.mimeType,
    step.config.assetUrl,
    step.config.originalName,
  );

  if (step.stepType === "pdf" && url) {
    if (htmlAsset) {
      return (
        <HtmlEmbed
          url={url}
          title={step.config.originalName ?? moduleTitle}
          eyebrow="Interactive lesson"
          chrome={false}
          iframeRef={htmlIframeRef}
        />
      );
    }
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(100%,96vw)] flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
            PDF · Page {pdfPage} of {pdfPages}
          </p>
          <div className="flex items-center gap-2 text-zinc-200">
            <FileText className="h-3.5 w-3.5 text-[#f15a24]" />
            <span className="max-w-[min(40vw,280px)] truncate text-xs font-semibold text-white">
              {step.config.originalName ?? moduleTitle}
            </span>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900">
          <PdfPageViewer pdfUrl={url} pageNumber={pdfPage} onLoadSuccess={onPdfPages} />
        </div>
      </div>
    );
  }

  if (step.stepType === "video" && url) {
    return <CourseVideoPlayer url={url} originalName={step.config.originalName} />;
  }

  if (step.stepType === "mindmap" && url) {
    if (htmlAsset) {
      return (
        <HtmlEmbed
          url={url}
          title={step.config.originalName}
          eyebrow="Interactive mind map"
          chrome={false}
        />
      );
    }
    return <MindMapPanel url={url} title={step.config.originalName} />;
  }

  if (step.stepType === "infographic" && url) {
    const isPdf =
      step.config.mimeType === "application/pdf" || url.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      return (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950">
          <PdfPageViewer pdfUrl={url} pageNumber={1} onLoadSuccess={() => undefined} />
        </div>
      );
    }
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
          Infographic
        </p>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-zinc-900 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={step.config.originalName ?? "Infographic"}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-600 bg-zinc-900/50 p-10 text-center">
      <Icon className="h-10 w-10 text-zinc-500" />
      <p className="text-sm text-zinc-400">
        {COURSE_STEP_LABELS[step.stepType]} content is not available. Contact your administrator.
      </p>
    </div>
  );
}

function CourseVideoPlayer({
  url,
  originalName,
}: {
  url: string;
  originalName?: string;
}) {
  const [videoError, setVideoError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(100%,96vw)] flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 shadow-2xl">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <Video className="h-4 w-4 text-[#2e3192]" />
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
          Training video
        </p>
        <span className="truncate text-xs text-zinc-400">{originalName}</span>
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        {videoError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Video className="h-8 w-8 text-zinc-500" />
            <p className="text-sm text-zinc-300">{videoError}</p>
            <p className="text-xs text-zinc-500">
              Ask your administrator to re-upload the video in the course builder.
            </p>
          </div>
        ) : (
          <video
            key={url}
            src={url}
            controls
            controlsList="nodownload"
            preload="metadata"
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            onError={(e) => {
              const el = e.currentTarget;
              const mediaCode = el.error?.code;
              const mediaMsg = el.error?.message;
              void fetch(url, { method: "HEAD" })
                .then(async (res) => {
                  const ct = res.headers.get("content-type") ?? "unknown";
                  setVideoError(
                    `Video failed to load (HTTP ${res.status}, ${ct}${mediaCode != null ? `, media error ${mediaCode}` : ""}${mediaMsg ? `: ${mediaMsg}` : ""}).`,
                  );
                })
                .catch(() => {
                  setVideoError(
                    `This video could not be loaded${mediaCode != null ? ` (media error ${mediaCode})` : ""}. It may be missing from storage or use an unsupported format.`,
                  );
                });
            }}
          >
            Your browser does not support video playback.
          </video>
        )}
      </div>
    </div>
  );
}

function MindMapPanel({ url, title }: { url: string; title?: string }) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load mind map.");
        return r.json();
      })
      .then((json) => setData(json))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [url]);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <Network className="h-4 w-4 text-[#2e3192]" />
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">Mind map</p>
        {title && <span className="truncate text-xs text-zinc-400">{title}</span>}
      </div>
      <div className="min-h-0 flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#f15a24]" />
            Loading mind map…
          </div>
        )}
        {error && (
          <p className="flex h-full items-center justify-center py-10 text-center text-sm text-red-400">
            {error}
          </p>
        )}
        {!loading && !error && data != null && (
          <MindMapPlayground data={data} title={title} />
        )}
      </div>
    </div>
  );
}

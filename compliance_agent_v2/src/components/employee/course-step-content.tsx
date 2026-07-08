"use client";

import {
  COURSE_STEP_LABELS,
  isHtmlCourseAsset,
  type CourseStepRow,
  type CourseStepType,
} from "@/lib/course-step-types";
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

function HtmlEmbed({
  url,
  title,
  eyebrow,
}: {
  url: string;
  title?: string;
  eyebrow: string;
}) {
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
          key={url}
          src={url}
          title={title ?? eyebrow}
          className="absolute inset-0 h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
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
}: {
  step: CourseStepRow;
  pdfPage: number;
  pdfPages: number;
  moduleTitle: string;
  onPdfPages: (n: number) => void;
}) {
  const Icon = STEP_ICONS[step.stepType];
  const url = step.config.assetUrl;
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
    return (
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <Video className="h-4 w-4 text-violet-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
            Training video
          </p>
          <span className="truncate text-xs text-zinc-400">{step.config.originalName}</span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-2">
          <video
            key={url}
            src={url}
            controls
            controlsList="nodownload"
            className="max-h-full max-w-full rounded-md"
            playsInline
          >
            Your browser does not support video playback.
          </video>
        </div>
      </div>
    );
  }

  if (step.stepType === "mindmap" && url) {
    if (htmlAsset) {
      return (
        <HtmlEmbed
          url={url}
          title={step.config.originalName}
          eyebrow="Interactive mind map"
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
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-4">
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
        <Network className="h-4 w-4 text-violet-400" />
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">Mind map</p>
        {title && <span className="truncate text-xs text-zinc-400">{title}</span>}
      </div>
      <div className="min-h-0 flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
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

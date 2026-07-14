"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import {
  COURSE_STEP_LABELS,
  COURSE_STEP_ORDER,
  type CourseStepRow,
  type CourseStepType,
} from "@/lib/course-step-types";
import { cn } from "@/lib/utils";
import {
  FileCode2,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Network,
  Video,
} from "lucide-react";

const STEP_ICONS: Record<CourseStepType, typeof FileCode2> = {
  pdf: FileCode2,
  scenarios: GraduationCap,
  video: Video,
  mindmap: Network,
  infographic: ImageIcon,
  quiz: FileText,
};

const STEP_BLURBS: Record<CourseStepType, string> = {
  pdf: "Interactive slides covering core AI concepts",
  scenarios: "Pick your department and practice a real workplace case",
  video: "Watch the training video",
  mindmap: "Explore the concept map at your pace",
  infographic: "Review the visual summary",
  quiz: "Checkpoint questions to confirm understanding",
};

export function CourseContentOverview({
  moduleTitle,
  moduleDescription,
  durationMinutes,
  steps,
  questionCount,
  onBegin,
}: {
  moduleTitle: string;
  moduleDescription?: string;
  durationMinutes?: number;
  steps: CourseStepRow[];
  questionCount: number;
  onBegin: () => void;
}) {
  const byType = new Map(steps.map((s) => [s.stepType, s]));
  const items = COURSE_STEP_ORDER.map((type, index) => {
    const step = byType.get(type);
    const available =
      type === "quiz" ? questionCount > 0 : Boolean(step?.config.assetUrl);
    return {
      type,
      index: index + 1,
      label: COURSE_STEP_LABELS[type],
      blurb: STEP_BLURBS[type],
      available,
      meta:
        type === "quiz"
          ? `${questionCount} question${questionCount === 1 ? "" : "s"}`
          : step?.config.originalName
            ? undefined
            : available
              ? "Included"
              : "Not in this bundle",
    };
  }).filter((item) => item.available || item.type === "quiz");

  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-auto bg-[#0a0a0a] p-4 sm:p-8">
      <div className="w-full max-w-3xl space-y-5">
        <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <BrandPanelHeader
            eyebrow="Your learning path"
            title={moduleTitle}
            description={
              moduleDescription?.trim() ||
              "You will move through each section below in order. Stay in fullscreen until you finish."
            }
            icon={GraduationCap}
            compact
          />
          <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6">
            {(durationMinutes ?? 0) > 0 && (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f15a24]">
                About {durationMinutes} minutes
              </p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const Icon = STEP_ICONS[item.type];
                return (
                  <li
                    key={item.type}
                    className={cn(
                      "flex gap-3 rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-[#f8f8ff] p-3.5",
                      !item.available && "opacity-50",
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2e3192]/10 text-[#2e3192]">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f15a24]">
                        Step {String(item.index).padStart(2, "0")}
                      </p>
                      <p className="text-sm font-semibold text-[#1e2060]">{item.label}</p>
                      <p className="mt-0.5 text-xs leading-snug text-zinc-500">{item.blurb}</p>
                      {item.meta && (
                        <p className="mt-1 text-[11px] font-medium text-zinc-400">{item.meta}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                Exiting early marks this attempt as failed and requires admin review to retake.
              </p>
              <Button
                type="button"
                onClick={onBegin}
                className="shrink-0 bg-[#2e3192] text-white hover:bg-[#25277a]"
              >
                Begin course
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

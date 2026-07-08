"use client";

import { CourseBuilderPanel } from "@/components/admin/course-builder-panel";
import { ReuseContentPanel } from "@/components/admin/reuse-content-panel";
import { ReuseCoursePanel } from "@/components/admin/reuse-course-panel";
import { UploadPanel } from "@/components/admin/upload-panel";
import { cn } from "@/lib/utils";
import { GraduationCap, RefreshCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { useState } from "react";

type TrackId = "compliance" | "courses";
type ComplianceTabId = "upload" | "reuse";
type CourseTabId = "build" | "reuse";

const TRACKS: { id: TrackId; label: string; icon: typeof ShieldCheck }[] = [
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "courses", label: "Courses", icon: GraduationCap },
];

const COMPLIANCE_TABS: { id: ComplianceTabId; label: string; icon: typeof UploadCloud }[] = [
  { id: "upload", label: "Upload new", icon: UploadCloud },
  { id: "reuse", label: "Reuse content", icon: RefreshCcw },
];

const COURSE_TABS: { id: CourseTabId; label: string; icon: typeof UploadCloud }[] = [
  { id: "build", label: "Build new course", icon: UploadCloud },
  { id: "reuse", label: "Reuse bundle", icon: RefreshCcw },
];

export function ContentLibraryHub() {
  const [track, setTrack] = useState<TrackId>("compliance");
  const [complianceTab, setComplianceTab] = useState<ComplianceTabId>("upload");
  const [courseTab, setCourseTab] = useState<CourseTabId>("build");

  return (
    <div className="space-y-8">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/60 p-1">
        {TRACKS.map((t) => {
          const active = track === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrack(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-white text-[#2e3192] shadow-sm ring-1 ring-zinc-200/80"
                  : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900",
              )}
            >
              <t.icon className="h-4 w-4" strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      {track === "compliance" && (
        <>
          <p className="text-sm text-zinc-600">
            POSH, security, and mandatory assessments — PDF upload with AI-generated checkpoint
            questions.
          </p>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200/80 bg-zinc-50 p-1">
            {COMPLIANCE_TABS.map((t) => {
              const active = complianceTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setComplianceTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-white text-[#2e3192] shadow-sm"
                      : "text-zinc-600 hover:bg-white/80",
                  )}
                >
                  <t.icon className="h-4 w-4" strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </div>
          {complianceTab === "upload" && <UploadPanel />}
          {complianceTab === "reuse" && <ReuseContentPanel />}
        </>
      )}

      {track === "courses" && (
        <>
          <p className="text-sm text-zinc-600">
            Mandatory courses with proctored training — upload a full content bundle (HTML lesson,
            video, HTML mind map, infographic, quiz) or reuse an existing bundle across batches.
          </p>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200/80 bg-zinc-50 p-1">
            {COURSE_TABS.map((t) => {
              const active = courseTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCourseTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-zinc-600 hover:bg-white/80",
                  )}
                >
                  <t.icon className="h-4 w-4" strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </div>
          {courseTab === "build" && <CourseBuilderPanel />}
          {courseTab === "reuse" && <ReuseCoursePanel />}
        </>
      )}
    </div>
  );
}

"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { LEARNER_PAGE_ROLES } from "@/lib/access-policy";
import { TrainingCompletedGate } from "@/components/employee/training-completed-gate";
import type { CourseStepRow } from "@/lib/course-step-types";
import type { CourseResumeCheckpoint } from "@/lib/course-resume";
import type { McqQuestion, TrainingModule } from "@/lib/types";
import { useAuthStore } from "@/lib/auth-store";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const preloadSlideViewer = () =>
  import("@/components/employee/slide-viewer").then((mod) => mod.SlideViewer);

const preloadCoursePlayer = () =>
  import("@/components/employee/course-player").then((mod) => mod.CoursePlayer);

const SlideViewer = dynamic(() => preloadSlideViewer(), { ssr: false });
const CoursePlayer = dynamic(() => preloadCoursePlayer(), { ssr: false });

export default function TrainingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [freshStart, setFreshStart] = useState(false);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { status: sessionStatus } = useSession();
  const id = typeof params.id === "string" ? params.id : "";

  const [trainingModule, setTrainingModule] = useState<TrainingModule | undefined>();
  const [mcqs, setMcqs] = useState<McqQuestion[]>([]);
  const [steps, setSteps] = useState<CourseStepRow[]>([]);
  const [resumeCheckpoint, setResumeCheckpoint] = useState<CourseResumeCheckpoint | null>(
    null,
  );
  const [ready, setReady] = useState(false);

  const authReady =
    sessionStatus !== "loading" &&
    isHydrated &&
    (sessionStatus === "authenticated" ? !!user?.username : true);

  useEffect(() => {
    void preloadSlideViewer();
    void preloadCoursePlayer();
    setFreshStart(new URLSearchParams(window.location.search).get("fresh") === "1");
  }, []);

  useEffect(() => {
    if (!id || !authReady) return;
    const qs = new URLSearchParams();
    if (user?.username) qs.set("userEmail", user.username);
    const forEmail = searchParams.get("forEmail");
    if (forEmail) qs.set("forEmail", forEmail);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    const controller = new AbortController();
    fetch(`/api/modules/${encodeURIComponent(id)}${query}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setTrainingModule(data.module);
          setMcqs(data.mcqs ?? []);
          setSteps(data.steps ?? []);
          setResumeCheckpoint(
            (data.resumeCheckpoint as CourseResumeCheckpoint | null) ?? null,
          );
          const pdf = data.module?.pdfUrl as string | undefined;
          if (pdf && typeof window !== "undefined") {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = pdf;
            document.head.appendChild(link);
          }
          // Prefetch only the resume/current step asset — never the first HTML
          // lesson mislabeled as video (that races the real first paint).
          const stepList = (data.steps ?? []) as Array<{
            stepType?: string;
            config?: { assetUrl?: string };
          }>;
          const resume = data.resumeCheckpoint as CourseResumeCheckpoint | null;
          const resumeIdx = Math.min(
            Math.max(0, resume?.contentStepIndex ?? 0),
            Math.max(0, stepList.length - 1),
          );
          const resumeStep = stepList[resumeIdx];
          const resumeUrl = resumeStep?.config?.assetUrl;
          if (
            resumeUrl &&
            typeof window !== "undefined" &&
            resumeStep?.stepType !== "video"
          ) {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = resumeUrl;
            document.head.appendChild(link);
          }
        } else {
          setTrainingModule(undefined);
          setResumeCheckpoint(null);
        }
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTrainingModule(undefined);
          setResumeCheckpoint(null);
          setReady(true);
        }
      });
    return () => controller.abort();
  }, [id, user?.username, authReady, searchParams]);

  useEffect(() => {
    if (!authReady || !ready) return;
    if (!trainingModule) router.replace("/dashboard");
  }, [ready, trainingModule, router, authReady]);

  if (!authReady || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <Loader2 className="h-8 w-8 animate-spin text-[#2e3192]" />
      </div>
    );
  }

  if (!trainingModule) return null;

  if (trainingModule.viewerMode === "already_completed") {
    return (
      <RouteGuard allowedRoles={LEARNER_PAGE_ROLES}>
        <TrainingCompletedGate moduleTitle={trainingModule.title} />
      </RouteGuard>
    );
  }

  const isCourseTraining =
    trainingModule.moduleKind === "course" ||
    steps.some((s) => s.stepType !== "quiz");

  if (isCourseTraining) {
    return (
      <RouteGuard allowedRoles={LEARNER_PAGE_ROLES}>
        <CoursePlayer
          module={trainingModule}
          steps={steps}
          mcqs={mcqs}
          freshStart={freshStart}
          resumeCheckpoint={resumeCheckpoint}
        />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard allowedRoles={LEARNER_PAGE_ROLES}>
      <SlideViewer module={trainingModule} mcqs={mcqs} freshStart={freshStart} />
    </RouteGuard>
  );
}

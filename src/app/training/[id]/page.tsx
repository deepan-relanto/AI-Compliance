"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { TrainingCompletedGate } from "@/components/employee/training-completed-gate";
import type { CourseStepRow } from "@/lib/course-step-types";
import type { McqQuestion, TrainingModule } from "@/lib/types";
import { useAuthStore } from "@/lib/auth-store";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
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
  const user = useAuthStore((s) => s.user);
  const [freshStart, setFreshStart] = useState(false);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { status: sessionStatus } = useSession();
  const id = typeof params.id === "string" ? params.id : "";

  const [trainingModule, setTrainingModule] = useState<TrainingModule | undefined>();
  const [mcqs, setMcqs] = useState<McqQuestion[]>([]);
  const [steps, setSteps] = useState<CourseStepRow[]>([]);
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
    const query = user?.username
      ? `?userEmail=${encodeURIComponent(user.username)}`
      : "";
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
          const pdf = data.module?.pdfUrl as string | undefined;
          if (pdf && typeof window !== "undefined") {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = pdf;
            document.head.appendChild(link);
          }
          const stepList = (data.steps ?? []) as Array<{ config?: { assetUrl?: string } }>;
          const videoUrl = stepList.find((s) =>
            String(s.config?.assetUrl ?? "").includes("/course-assets/"),
          )?.config?.assetUrl;
          if (videoUrl && typeof window !== "undefined") {
            const v = document.createElement("link");
            v.rel = "prefetch";
            v.as = "video";
            v.href = videoUrl;
            document.head.appendChild(v);
          }
        } else {
          setTrainingModule(undefined);
        }
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTrainingModule(undefined);
          setReady(true);
        }
      });
    return () => controller.abort();
  }, [id, user?.username, authReady]);

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
      <RouteGuard allowedRoles={["user"]}>
        <TrainingCompletedGate moduleTitle={trainingModule.title} />
      </RouteGuard>
    );
  }

  const isCourseTraining =
    trainingModule.moduleKind === "course" ||
    steps.some((s) => s.stepType !== "quiz");

  if (isCourseTraining) {
    return (
      <RouteGuard allowedRoles={["user"]}>
        <CoursePlayer
          module={trainingModule}
          steps={steps}
          mcqs={mcqs}
          freshStart={freshStart}
        />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard allowedRoles={["user"]}>
      <SlideViewer module={trainingModule} mcqs={mcqs} freshStart={freshStart} />
    </RouteGuard>
  );
}

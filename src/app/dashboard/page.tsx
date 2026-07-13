"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { ModuleCard } from "@/components/employee/module-card";
import { EmployeeShell } from "@/components/layout/employee-shell";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/ui/page-section";
import { StatCard } from "@/components/ui/stat-card";
import { useAuthStore } from "@/lib/auth-store";
import type { ServerProgressEntry } from "@/lib/progress-api";
import { fetchLearnerDashboard } from "@/lib/progress-api";
import {
  getProgressForUser,
  mergeServerProgress,
  clearStaleLocalProgress,
  clearAllLocalProgressForUser,
} from "@/lib/progress-store";
import { emailsMatch } from "@/lib/training-link";
import type { ModuleStatus, TrainingModule } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AssessmentFilter = "all" | "completed" | "not_started";

function resolveStatus(
  module: TrainingModule,
  statusByModule: Record<string, ModuleStatus>,
): ModuleStatus {
  return statusByModule[module.id] ?? module.status ?? "not_started";
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { data: session, status: sessionStatus, update: updateSession } =
    useSession();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [statusByModule, setStatusByModule] = useState<Record<string, ModuleStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [filter, setFilter] = useState<AssessmentFilter>("all");
  const sessionRefreshedRef = useRef(false);

  const sessionEmail = session?.user?.email ?? null;

  const authReady =
    sessionStatus === "authenticated" &&
    isHydrated &&
    !!sessionEmail &&
    !!user?.username &&
    emailsMatch(sessionEmail, user.username);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || sessionRefreshedRef.current) return;
    sessionRefreshedRef.current = true;
    void updateSession();
  }, [sessionStatus, updateSession]);

  const loadModules = useCallback(async () => {
    if (!authReady || !user?.username) return;

    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchLearnerDashboard();

      if (!result.ok) {
        setLoadError(result.error);
        return;
      }

      const { profile } = result;
      if (
        user?.username !== profile.email ||
        user?.batchId !== profile.batchId ||
        user?.displayName !== profile.displayName ||
        user?.role !== profile.role
      ) {
        setUser({
          username: profile.email,
          role: profile.role,
          batchId: profile.batchId,
          displayName: profile.displayName,
        });
      }

      const username = profile.email;
      const serverEntries = result.progress;
      setModules(result.modules);

      if (serverEntries.length > 0) {
        mergeServerProgress(
          username,
          serverEntries.map((e: ServerProgressEntry) => ({
            moduleId: e.moduleId,
            moduleTitle: e.moduleTitle,
            batchId: e.batchId,
            currentSlide: e.currentSlide,
            totalSlides: e.totalSlides,
            status: e.status,
            retakeCount: e.retakeCount,
            mcqCorrect: e.mcqCorrect,
            mcqTotal: e.mcqTotal,
            scorePercent: e.scorePercent,
            failedReason: e.failedReason,
            completedAt: e.completedAt,
            warningCount: e.warningCount,
          })),
        );
        clearStaleLocalProgress(username, {
          serverModuleIds: serverEntries.map((e) => e.moduleId),
          assignedModuleIds: result.modules.map((m) => m.id),
        });
      } else if (result.modules.length === 0) {
        clearAllLocalProgressForUser(username);
      }

      const progressEntries = getProgressForUser(username);
      const progressMap = Object.fromEntries(
        progressEntries.map((p) => [p.moduleId, p.status]),
      );
      const statusMap: Record<string, ModuleStatus> = {};
      let completed = 0;
      let inProgress = 0;
      for (const m of result.modules) {
        const entry = progressEntries.find((p) => p.moduleId === m.id);
        const s = progressMap[m.id] ?? m.status ?? "not_started";
        const attempted =
          s === "in_progress" ||
          s === "failed" ||
          (entry?.scorePercent != null && s !== "permanently_failed");
        statusMap[m.id] =
          s === "failed" && entry?.scorePercent != null ? "in_progress" : s;
        if (s === "completed") completed++;
        else if (attempted) inProgress++;
      }
      setStatusByModule(statusMap);
      setCompletedCount(completed);
      setInProgressCount(inProgress);
    } catch {
      setLoadError("Something went wrong while loading your training.");
    } finally {
      setLoading(false);
    }
  }, [authReady, user, setUser]);

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }
    void loadModules();
  }, [authReady, loadModules, sessionEmail]);

  useEffect(() => {
    if (!authReady) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void updateSession().then(() => loadModules());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authReady, loadModules, updateSession]);

  const batchId = user?.batchId ?? "";
  const totalMinutes = modules.reduce((acc, m) => acc + m.durationMinutes, 0);
  const batchLabel = batchId
    ? batchId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
  const completionPct =
    modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  const notStartedCount = useMemo(
    () =>
      modules.filter(
        (m) => resolveStatus(m, statusByModule) === "not_started",
      ).length,
    [modules, statusByModule],
  );

  const assignedCount = useMemo(
    () =>
      modules.filter(
        (m) => resolveStatus(m, statusByModule) !== "completed",
      ).length,
    [modules, statusByModule],
  );

  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const status = resolveStatus(m, statusByModule);
      if (filter === "completed") return status === "completed";
      if (filter === "not_started") return status === "not_started";
      return true;
    });
  }, [modules, statusByModule, filter]);

  const filterPills: { key: AssessmentFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: modules.length },
    { key: "not_started", label: "Not started", count: notStartedCount },
    { key: "completed", label: "Completed", count: completedCount },
  ];

  const displayName = user?.displayName ?? "Learner";

  return (
    <RouteGuard allowedRoles={["user"]}>
      <EmployeeShell
        title="My training"
        subtitle="Complete mandatory assessments and courses assigned to your batch. Progress is saved automatically."
      >
        <div className="surface-card mb-8 overflow-hidden p-2 sm:p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="flex min-h-[148px] flex-1 items-center gap-5 rounded-lg bg-gradient-to-br from-[#2e3192]/8 via-[#2e3192]/3 to-[#f15a24]/5 px-6 py-6 sm:px-8">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#2e3192] shadow-md shadow-[#2e3192]/20">
                <GraduationCap className="h-7 w-7 text-white" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#f15a24]">
                  Welcome back
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[1.85rem]">
                  {displayName}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
                  {inProgressCount > 0
                    ? `You have ${inProgressCount} module${inProgressCount === 1 ? "" : "s"} in progress. Pick up where you left off.`
                    : completedCount === modules.length && modules.length > 0
                      ? "You have completed all assigned training for your batch."
                      : "Complete your mandatory training to stay compliant."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2e3192]/15 bg-white/90 px-3 py-1 text-xs font-semibold text-[#2e3192]">
                    {batchLabel}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {user?.username}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col justify-center rounded-lg border border-zinc-100 bg-zinc-50/90 px-6 py-5 lg:w-[375px] lg:shrink-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Overall completion
                </p>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900">
                  {completionPct}%
                </p>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-200/90">
                <div
                  className="h-full rounded-full bg-[#2e3192] transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <p className="mt-2.5 text-xs text-zinc-500">
                {completedCount} of {modules.length} module
                {modules.length === 1 ? "" : "s"} completed
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-zinc-200/80 pt-4 text-xs text-zinc-500">
                <Shield className="h-3.5 w-3.5 shrink-0 text-[#2e3192]" strokeWidth={1.75} />
                Proctored sessions
              </div>
            </div>
          </div>
        </div>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Assigned"
            value={assignedCount}
            hint={
              assignedCount === 0 && modules.length > 0
                ? "All done"
                : modules.length > 0
                  ? `${modules.length} total in batch`
                  : undefined
            }
            icon={BookOpen}
            accent="brand"
          />
          <StatCard
            label="In progress"
            value={inProgressCount}
            icon={Clock3}
            accent="accent"
          />
          <StatCard
            label="Completed"
            value={completedCount}
            hint={totalMinutes > 0 ? `~${totalMinutes} min total` : undefined}
            icon={CheckCircle2}
            accent="success"
          />
        </section>

        <PageSection
          title="Your training"
          description={
            modules.length > 0
              ? "Select a module to start or resume. Progress is saved automatically."
              : undefined
          }
          action={
            !loading && !loadError && modules.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {filterPills.map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setFilter(pill.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      filter === pill.key
                        ? "border-[#2e3192]/30 bg-[#2e3192] text-white shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                    )}
                  >
                    {pill.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        filter === pill.key
                          ? "bg-white/20 text-white"
                          : "bg-zinc-100 text-zinc-500",
                      )}
                    >
                      {pill.count}
                    </span>
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          {loading ? (
            <div className="empty-state py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#2e3192]" />
              <p className="mt-3 text-sm text-zinc-500">Loading training…</p>
            </div>
          ) : loadError ? (
            <div className="empty-state py-16">
              <div className="icon-tile h-12 w-12">
                <AlertTriangle className="h-6 w-6 text-[#f15a24]" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-800">
                Could not load your training
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-zinc-500">{loadError}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => void loadModules()}
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Try again
              </Button>
            </div>
          ) : modules.length === 0 ? (
            <div className="empty-state">
              <div className="icon-tile h-12 w-12">
                <BookOpen className="h-6 w-6 text-zinc-400" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-800">
                No training assigned yet
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-zinc-500">
                Your administrator will publish training for your batch. Check back
                soon or contact your compliance lead.
              </p>
            </div>
          ) : filteredModules.length === 0 ? (
            <div className="empty-state py-12">
              <p className="text-sm font-medium text-zinc-700">
                No modules match this filter
              </p>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-3 text-sm font-medium text-[#2e3192] hover:underline"
              >
                Show all modules
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredModules.map((module) => (
                <ModuleCard key={module.id} module={module} />
              ))}
            </div>
          )}
        </PageSection>
      </EmployeeShell>
    </RouteGuard>
  );
}

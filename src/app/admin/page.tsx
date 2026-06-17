"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import type { AnalyticsPayload } from "@/lib/analytics-types";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Layers3,
  Library,
  Loader2,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function clamp(v: number) {
  return Math.min(100, Math.max(0, v));
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const quickActions = [
  {
    href: "/admin/upload",
    label: "Content library",
    title: "Upload & publish",
    description: "Convert PDFs, generate MCQ checkpoints, and push to batches.",
    icon: Upload,
    accent: "brand" as const,
  },
  {
    href: "/admin/batches",
    label: "Batches",
    title: "Batch management",
    description: "View learner rosters per batch. Scores and exports live in Analytics.",
    icon: Layers3,
    accent: "accent" as const,
  },
  {
    href: "/admin/monitoring",
    label: "Integrity",
    title: "Live monitoring",
    description: "Warnings, focus events, and proctoring violations in real time.",
    icon: ShieldAlert,
    accent: "danger" as const,
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    title: "Reports & exports",
    description: "Cross-batch trends, time-series charts, CSV and PDF exports.",
    icon: BarChart3,
    accent: "info" as const,
  },
  {
    href: "/admin/feedback",
    label: "Feedback",
    title: "Learner feedback",
    description: "Search, filter by batch, and download submitted feedback.",
    icon: MessageSquare,
    accent: "success" as const,
  },
  {
    href: "/admin/upload",
    label: "Resources",
    title: "Content library hub",
    description: "Reuse existing PDFs and republish to new batches.",
    icon: Library,
    accent: "muted" as const,
  },
];

const accentTokens: Record<
  "brand" | "accent" | "danger" | "info" | "success" | "muted",
  { tile: string; icon: string; ring: string; chip: string }
> = {
  brand: {
    tile: "bg-[#2e3192]/8 border-[#2e3192]/15",
    icon: "text-[#2e3192]",
    ring: "group-hover:ring-[#2e3192]/20",
    chip: "text-[#2e3192]",
  },
  accent: {
    tile: "bg-orange-50 border-orange-100",
    icon: "text-[#f15a24]",
    ring: "group-hover:ring-orange-200/60",
    chip: "text-[#f15a24]",
  },
  danger: {
    tile: "bg-red-50 border-red-100",
    icon: "text-red-600",
    ring: "group-hover:ring-red-200/60",
    chip: "text-red-700",
  },
  info: {
    tile: "bg-blue-50 border-blue-100",
    icon: "text-blue-600",
    ring: "group-hover:ring-blue-200/60",
    chip: "text-blue-700",
  },
  success: {
    tile: "bg-emerald-50 border-emerald-100",
    icon: "text-emerald-600",
    ring: "group-hover:ring-emerald-200/60",
    chip: "text-emerald-700",
  },
  muted: {
    tile: "bg-zinc-100 border-zinc-200",
    icon: "text-zinc-600",
    ring: "group-hover:ring-zinc-200",
    chip: "text-zinc-700",
  },
};

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  hint,
  accent = "muted",
  highlight,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: typeof Users;
  hint?: string;
  accent?: keyof typeof accentTokens;
  highlight?: boolean;
}) {
  const tone = accentTokens[accent];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-card)] border bg-white p-5 transition-all duration-300 hover:shadow-[var(--shadow-elevated)]",
        highlight
          ? "border-[#2e3192]/20 bg-gradient-to-br from-[#2e3192]/[0.04] via-white to-white"
          : "border-zinc-200/80",
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-[12px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-105",
            tone.tile,
          )}
        >
          <Icon className={cn("h-4 w-4", tone.icon)} strokeWidth={1.75} />
        </div>
      </div>
      <p className="mt-5 flex items-baseline text-[2rem] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums">
        {value}
        {suffix && (
          <span className="ml-1 text-base font-medium text-zinc-400">{suffix}</span>
        )}
      </p>
      {hint && <p className="mt-2 text-xs text-zinc-500">{hint}</p>}
      {highlight && (
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[#2e3192]/10 to-transparent blur-2xl" />
      )}
    </div>
  );
}

// ─── Recent activity item ────────────────────────────────────────────────────

function ActivityItem({
  email,
  module,
  batchLabel,
  status,
  score,
  when,
}: {
  email: string;
  module: string;
  batchLabel: string | null;
  status: string;
  score: number | null;
  when: string;
}) {
  const passed = score != null && score > PASS_THRESHOLD_PERCENT;
  const failed = status === "failed" || status === "permanently_failed";

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          passed
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : failed
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-zinc-200 bg-zinc-50 text-zinc-600",
        )}
      >
        {passed ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : failed ? (
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <Activity className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800">
          <span className="font-mono text-[12px] text-zinc-600">{email}</span>{" "}
          <span className="text-zinc-400">·</span>{" "}
          <span className="text-zinc-700">{module}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {batchLabel ?? "Unknown batch"} · {when}
        </p>
      </div>
      {score != null ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
            passed
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800",
          )}
        >
          {clamp(score)}%
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
          {status.replace(/_/g, " ")}
        </span>
      )}
    </li>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d as AnalyticsPayload);
      })
      .finally(() => setLoading(false));
  }, []);

  const adminName = useMemo(() => {
    if (!user?.username) return "Admin";
    const local = user.username.split("@")[0] ?? user.username;
    return local
      .split(/[._-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }, [user?.username]);

  const summary = data?.summary;
  const topBatches = useMemo(() => {
    if (!data) return [];
    return [...data.batches]
      .sort((a, b) => b.totalAttempts - a.totalAttempts || b.compliance - a.compliance)
      .slice(0, 3);
  }, [data]);

  const recent = useMemo(() => {
    if (!data) return [];
    return data.history.slice(0, 6);
  }, [data]);

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell wide>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative mb-8 overflow-hidden rounded-[var(--radius-card)] border border-[#2e3192]/15 bg-gradient-to-br from-[#2e3192] via-[#3d42a8] to-[#4448c2] p-6 text-white shadow-[var(--shadow-card)] sm:p-8">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-[#f15a24]/20 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                  {formatDate()}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {greeting()}, {adminName} <span className="ml-1">👋</span>
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
                  Here&apos;s a snapshot of your organization&apos;s compliance health.
                  Jump into a workflow below or review live activity.
                </p>
              </div>
              <div className="hidden flex-col items-end gap-2 sm:flex">
                <Link
                  href="/admin/analytics"
                  className="group inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Open analytics
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/admin/upload"
                  className="group inline-flex items-center gap-2 rounded-full bg-[#f15a24] px-4 py-2 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(241,90,36,0.4)] transition-all hover:bg-[#ff6b35] hover:shadow-[0_2px_16px_rgba(241,90,36,0.5)]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload assessment
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-[var(--radius-card)] border border-zinc-200/80 bg-white py-16 text-sm text-zinc-500 shadow-[var(--shadow-card)]">
            <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
            Loading dashboard…
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Compliance"
              value={summary?.avgScore != null ? clamp(summary.avgScore) : 0}
              suffix="%"
              icon={ShieldCheck}
              accent="brand"
              highlight
              hint={`Pass threshold: ${PASS_THRESHOLD_PERCENT}% · ${summary?.completedCount ?? 0} passed`}
            />
            <KpiCard
              label="Active sessions"
              value={summary?.inProgressCount ?? 0}
              icon={Activity}
              accent="accent"
              hint={
                (summary?.inProgressCount ?? 0) > 0
                  ? "Learners in training right now"
                  : "No live sessions"
              }
            />
            <KpiCard
              label="Total learners"
              value={summary?.totalLearners ?? 0}
              icon={Users}
              accent="info"
              hint={`${summary?.totalBatches ?? 0} batches · ${summary?.publishedModules ?? 0} modules`}
            />
            <KpiCard
              label="Pass rate"
              value={summary?.passRate != null ? clamp(summary.passRate) : "—"}
              suffix={summary?.passRate != null ? "%" : undefined}
              icon={TrendingUp}
              accent="success"
              hint={`${summary?.failedCount ?? 0} failed · ${summary?.totalRetakes ?? 0} retakes`}
            />
          </section>
        )}

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="section-label">Workspace</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">
                Quick actions
              </h2>
            </div>
            <Link
              href="/admin/analytics"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2e3192] hover:text-[#3d42a8]"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((link) => {
              const tone = accentTokens[link.accent];
              return (
                <Link
                  key={link.title}
                  href={link.href}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-zinc-200/80 bg-white p-5 transition-all duration-300 hover:shadow-[var(--shadow-elevated)] ring-1 ring-transparent",
                    tone.ring,
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105",
                        tone.tile,
                      )}
                    >
                      <link.icon className={cn("h-4 w-4", tone.icon)} strokeWidth={1.75} />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#2e3192]" />
                  </div>
                  <p
                    className={cn(
                      "mt-5 text-[11px] font-semibold uppercase tracking-wider",
                      tone.chip,
                    )}
                  >
                    {link.label}
                  </p>
                  <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-zinc-900 group-hover:text-[#2e3192]">
                    {link.title}
                  </h3>
                  <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-zinc-500">
                    {link.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Activity + Top batches ───────────────────────────────────────── */}
        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="border-b border-zinc-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-label">Recent activity</p>
                  <h2 className="mt-1 text-base font-semibold text-zinc-900">
                    Latest learner attempts
                  </h2>
                </div>
                <Link
                  href="/admin/analytics"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2e3192] hover:text-[#3d42a8]"
                >
                  Full history
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {recent.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-600">
                      No assessment activity yet
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Publish a module and assign it to a batch to get started.
                    </p>
                  </div>
                  <Link
                    href="/admin/upload"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2e3192] hover:underline"
                  >
                    Upload assessment
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {recent.map((r) => (
                    <ActivityItem
                      key={`${r.userEmail}-${r.moduleTitle}-${r.updatedAt}`}
                      email={r.userEmail}
                      module={r.moduleTitle}
                      batchLabel={r.batchLabel}
                      status={r.status}
                      score={r.scorePercent}
                      when={new Date(r.completedAt ?? r.updatedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-zinc-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="section-label">Top batches</p>
                  <h2 className="mt-1 text-base font-semibold text-zinc-900">
                    By activity
                  </h2>
                </div>
                <Link
                  href="/admin/batches"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2e3192] hover:text-[#3d42a8]"
                >
                  All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {topBatches.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-zinc-600">No batch activity</p>
                  <p className="text-xs text-zinc-400">
                    Compliance metrics will appear after first attempts.
                  </p>
                </div>
              ) : (
                topBatches.map((b) => {
                  const compliance = clamp(b.compliance);
                  return (
                    <Link
                      key={b.id}
                      href={`/admin/batch/${b.id}`}
                      className="group block rounded-lg border border-zinc-200/80 p-3 transition-all hover:border-[#2e3192]/30 hover:bg-[#2e3192]/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-zinc-800 group-hover:text-[#2e3192]">
                          {b.label}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                            compliance >= 70
                              ? "bg-emerald-50 text-emerald-700"
                              : compliance > 0
                                ? "bg-amber-50 text-amber-800"
                                : "bg-zinc-100 text-zinc-500",
                          )}
                        >
                          {compliance}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            compliance >= 70
                              ? "bg-emerald-500"
                              : compliance > 0
                                ? "bg-amber-500"
                                : "bg-zinc-300",
                          )}
                          style={{ width: `${compliance}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500">
                        {b.totalAttempts} attempts · {b.memberCount} members
                      </p>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>
      </AdminShell>
    </RouteGuard>
  );
}

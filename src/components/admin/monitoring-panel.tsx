"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveReviewRequestApi,
  rejectReviewRequestApi,
} from "@/lib/review-api";
import type { AssessmentProgress, ReviewRequest, AuditLogEntry } from "@/lib/types";
import {
  Users,
  AlertOctagon,
  Eye,
  ShieldCheck,
  ShieldAlert,
  X,
  FileClock,
  CheckCircle,
  XCircle,
  CornerDownRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
const fetcher = (url: string) => fetch(url).then((res) => res.json());
import { cn } from "@/lib/utils";

type TabType = "violations" | "reviews" | "audit";

type ViolationFilter =
  | "all"
  | "in_progress"
  | "completed"
  | "failed"
  | "permanently_failed"
  | "with_warnings";

type ReviewFilter = "all" | "Pending" | "Approved" | "Rejected";

type AuditFilter = "all" | "failures" | "retakes" | "reviews" | "warnings";

type SortMode = "time" | "warnings";

interface AssessmentFacet {
  moduleId: string;
  moduleTitle: string;
  count: number;
}

interface Summary {
  activeAssessments: number;
  usersWithWarnings: number;
  totalWarnings: number;
  failedAssessments: number;
  permanentlyFailedCount: number;
  pendingReviewsCount: number;
}

const PAGE_SIZE = 25;

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "border-[#2e3192] bg-[#2e3192] text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

function buildMonitoringUrl(
  apiBase: string,
  tab: TabType,
  page: number,
  filter: string,
  moduleId: string,
  sort: SortMode,
): string {
  const params = new URLSearchParams({
    tab,
    page: String(page),
    pageSize: String(PAGE_SIZE),
    filter,
  });
  if (tab === "violations") {
    if (moduleId && moduleId !== "all") params.set("moduleId", moduleId);
    params.set("sort", sort);
  }
  return `${apiBase}?${params.toString()}`;
}

interface MonitoringPanelProps {
  apiBase?: string;
  approveReview?: typeof approveReviewRequestApi;
  rejectReview?: typeof rejectReviewRequestApi;
}

export function MonitoringPanel({
  apiBase = "/api/monitoring",
  approveReview = approveReviewRequestApi,
  rejectReview = rejectReviewRequestApi,
}: MonitoringPanelProps = {}) {
  // Summary KPI cards (lightweight — loads independently)
  // Pagination and Tabs
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>("violations");
  const [violationFilter, setViolationFilter] = useState<ViolationFilter>("all");
  const [assessmentFilter, setAssessmentFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("time");
  
  const [selectedRecord, setSelectedRecord] = useState<AssessmentProgress | null>(null);
  const [selectedReview, setSelectedReview] = useState<ReviewRequest | null>(null);

  // Rejection Comment State
  const [adminComment, setAdminComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data: summaryData, mutate: mutateSummary } = useSWR(`${apiBase}?summary=1`, fetcher);
  const summary = summaryData?.ok ? (summaryData as Summary) : null;

  const activeFilter =
    activeTab === "violations"
      ? violationFilter
      : activeTab === "reviews"
        ? reviewFilter
        : auditFilter;

  const { data: tabData, isLoading: tabLoading, isValidating: tabRefreshing, mutate: mutateTab } = useSWR(
    buildMonitoringUrl(apiBase, activeTab, page, activeFilter, assessmentFilter, sortMode),
    fetcher,
  );

  const records: AssessmentProgress[] = activeTab === "violations" && tabData?.ok && Array.isArray(tabData.records) ? tabData.records : [];
  const assessments: AssessmentFacet[] =
    activeTab === "violations" && tabData?.ok && Array.isArray(tabData.assessments)
      ? tabData.assessments
      : [];
  const reviews: ReviewRequest[] = activeTab === "reviews" && tabData?.ok && Array.isArray(tabData.reviews) ? tabData.reviews : [];
  const auditLogs: AuditLogEntry[] = activeTab === "audit" && tabData?.ok && Array.isArray(tabData.auditLogs) ? tabData.auditLogs : [];
  
  const totalRecords = activeTab === "violations" && tabData?.ok ? Number(tabData.total ?? 0) : 0;
  const totalReviews = activeTab === "reviews" && tabData?.ok ? Number(tabData.total ?? 0) : 0;
  const totalAudit = activeTab === "audit" && tabData?.ok ? Number(tabData.total ?? 0) : 0;


  const refreshData = async () => {
    await Promise.all([mutateSummary(), mutateTab()]);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleViolationFilterChange = (filter: ViolationFilter) => {
    setViolationFilter(filter);
    setPage(1);
  };

  const handleAssessmentFilterChange = (moduleId: string) => {
    setAssessmentFilter(moduleId);
    setPage(1);
  };

  const handleReviewFilterChange = (filter: ReviewFilter) => {
    setReviewFilter(filter);
    setPage(1);
  };

  const handleAuditFilterChange = (filter: AuditFilter) => {
    setAuditFilter(filter);
    setPage(1);
  };

  const handleSortChange = (sort: SortMode) => {
    setSortMode(sort);
    setPage(1);
  };

  const filtersActive =
    (activeTab === "violations" &&
      (violationFilter !== "all" || assessmentFilter !== "all" || sortMode !== "time")) ||
    (activeTab === "reviews" && reviewFilter !== "all") ||
    (activeTab === "audit" && auditFilter !== "all");

  // Derive summary metrics from loaded data or summary query
  const activeAssessments = summary?.activeAssessments ?? 0;
  const usersWithWarnings = summary?.usersWithWarnings ?? 0;
  const failedAssessments = summary?.failedAssessments ?? 0;
  const permanentlyFailedCount = summary?.permanentlyFailedCount ?? 0;
  const pendingReviewsCount = summary?.pendingReviewsCount ?? 0;
  const totalWarnings = summary?.totalWarnings ?? 0;

  // Current tab totals and sorted records
  const currentTotal =
    activeTab === "violations"
      ? totalRecords
      : activeTab === "reviews"
        ? totalReviews
        : totalAudit;
  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));

  const sortedRecords = records;

  const handleApprove = async (reqId: string) => {
    setActionError("");
    try {
      await approveReview(reqId);
      await refreshData();
      setSelectedReview(null);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to approve request.",
      );
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent, reqId: string) => {
    e.preventDefault();
    if (!adminComment.trim()) {
      setActionError("Please provide an administrative comment/reason for rejection.");
      return;
    }
    setActionError("");
    try {
      await rejectReview(reqId, adminComment.trim());
      await refreshData();
      setSelectedReview(null);
      setAdminComment("");
      setShowRejectForm(false);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to reject request.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => void refreshData()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      {/* ── Summary Cards Grid ────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Active</p>
              <h3 className="text-xl font-bold text-zinc-900">{activeAssessments}</h3>
              <p className="text-[9px] text-zinc-400">Assessments in progress</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Warnings</p>
              <h3 className="text-xl font-bold text-zinc-900">{totalWarnings}</h3>
              <p className="text-[9px] text-zinc-400">{usersWithWarnings} user{usersWithWarnings !== 1 ? "s" : ""} flagged</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Failed Attempts</p>
              <h3 className="text-xl font-bold text-zinc-900">{failedAssessments}</h3>
              <p className="text-[9px] text-zinc-400">Lockout thresholds hit</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <AlertOctagon className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Pending Reviews</p>
              <h3 className="text-xl font-bold text-zinc-900">{pendingReviewsCount}</h3>
              <p className="text-[9px] text-zinc-400">Review requests waiting</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <FileClock className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Permanently Failed</p>
              <h3 className="text-xl font-bold text-zinc-900">{permanentlyFailedCount}</h3>
              <p className="text-[9px] text-zinc-400">Retake limit exhausted</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-zinc-950 flex items-center justify-center text-zinc-50">
              <XCircle className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs Switcher ────────────────────────────────────────────────── */}
      <div className="tab-nav">
        <button
          onClick={() => handleTabChange("violations")}
          className={`tab-nav-item ${activeTab === "violations" ? "tab-nav-item-active" : ""}`}
        >
          Violations & Activity
        </button>
        <button
          onClick={() => handleTabChange("reviews")}
          className={`tab-nav-item flex items-center gap-1.5 ${activeTab === "reviews" ? "tab-nav-item-active" : ""}`}
        >
          Review Requests
          {pendingReviewsCount > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-100 px-1 text-[9px] font-bold text-red-600">
              {pendingReviewsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("audit")}
          className={`tab-nav-item ${activeTab === "audit" ? "tab-nav-item-active" : ""}`}
        >
          Audit Trail Logs
        </button>
      </div>

      {/* ── TAB CONTENT: Violations & Activity ──────────────────────────── */}
      {activeTab === "violations" && (
        <Card className="shadow-[var(--shadow-card)] border-zinc-200">
          <CardHeader className="space-y-4 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Live Assessment Activity</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Sorted by {sortMode === "time" ? "latest activity" : "warning count"}, newest first.
              </p>
            </div>
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </span>
                <FilterPill active={violationFilter === "all"} onClick={() => handleViolationFilterChange("all")}>
                  All
                </FilterPill>
                <FilterPill active={violationFilter === "in_progress"} onClick={() => handleViolationFilterChange("in_progress")}>
                  Active
                </FilterPill>
                <FilterPill active={violationFilter === "completed"} onClick={() => handleViolationFilterChange("completed")}>
                  Completed
                </FilterPill>
                <FilterPill active={violationFilter === "with_warnings"} onClick={() => handleViolationFilterChange("with_warnings")}>
                  With warnings
                </FilterPill>
                <FilterPill active={violationFilter === "failed"} onClick={() => handleViolationFilterChange("failed")}>
                  Failed
                </FilterPill>
                <FilterPill active={violationFilter === "permanently_failed"} onClick={() => handleViolationFilterChange("permanently_failed")}>
                  Perm. failed
                </FilterPill>
              </div>
              {assessments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Assessment
                  </span>
                  <FilterPill active={assessmentFilter === "all"} onClick={() => handleAssessmentFilterChange("all")}>
                    All assessments
                  </FilterPill>
                  {assessments.map((a) => (
                    <FilterPill
                      key={a.moduleId}
                      active={assessmentFilter === a.moduleId}
                      onClick={() => handleAssessmentFilterChange(a.moduleId)}
                    >
                      {a.moduleTitle}
                      <span className={cn("ml-1 tabular-nums", assessmentFilter === a.moduleId ? "text-white/80" : "text-zinc-400")}>
                        ({a.count})
                      </span>
                    </FilterPill>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Sort
                </span>
                <FilterPill active={sortMode === "time"} onClick={() => handleSortChange("time")}>
                  Latest activity
                </FilterPill>
                <FilterPill active={sortMode === "warnings"} onClick={() => handleSortChange("warnings")}>
                  Most warnings
                </FilterPill>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setViolationFilter("all");
                      setAssessmentFilter("all");
                      setSortMode("time");
                      setPage(1);
                    }}
                    className="ml-1 text-[11px] font-medium text-[#2e3192] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {tabLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#2e3192]" />
                Loading violations…
              </div>
            ) : sortedRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <ShieldCheck className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
                <p className="text-sm font-medium text-zinc-500">
                  {filtersActive ? "No records match these filters" : "No active assessments found"}
                </p>
                <p className="text-xs text-zinc-400">
                  {filtersActive
                    ? "Try a different status or assessment filter."
                    : "Integrity metrics will compile when users launch their training modules."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-medium text-zinc-500">
                      <th className="px-6 py-3">User</th>
                      <th className="px-6 py-3">Assessment</th>
                      <th className="px-6 py-3 text-center">Warnings</th>
                      <th className="px-6 py-3 text-center">Retakes Used</th>
                      <th className="px-6 py-3 text-center">Score</th>
                      <th className="px-6 py-3 text-center">Acknowledged</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 font-medium">Last Activity</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecords.map((record, i) => (
                      <tr
                        key={`${record.username}-${record.moduleId}`}
                        className={`border-b border-zinc-50 transition-colors hover:bg-zinc-50/50 ${
                          i === sortedRecords.length - 1 ? "border-0" : ""
                        }`}
                      >
                        <td className="px-6 py-4 align-middle">
                          <p className="font-semibold text-zinc-800 text-xs">{record.username}</p>
                          <p className="font-mono text-[9px] text-zinc-400">
                            Batch:{" "}
                            {record.batchLabel ||
                              record.batchId?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
                              "—"}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <p className="font-medium text-zinc-800 text-xs">{record.moduleTitle}</p>
                          <p className="font-mono text-[9px] text-zinc-400">ID: {record.moduleId}</p>
                        </td>
                        <td className="px-6 py-4 align-middle text-center">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold ${
                              record.warningCount >= 3
                                ? "bg-red-100 text-red-700"
                                : record.warningCount > 0
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {record.warningCount || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-middle text-center text-xs font-semibold text-zinc-700">
                          {record.retakeCount ?? 0} / 2
                        </td>
                        <td className="px-6 py-4 align-middle text-center">
                          {record.scorePercent != null ? (
                            <span
                              className={cn(
                                "inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums",
                                record.scorePercent >= 70
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                                  : "bg-red-50 text-red-700 border border-red-200/50",
                              )}
                            >
                              {record.scorePercent}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 align-middle text-center">
                          {record.acknowledgement?.accepted ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/40">
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 border border-zinc-200">
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-6 py-4 align-middle text-xs text-zinc-500 tabular-nums">
                          {record.lastAccessedAt
                            ? new Date(record.lastAccessedAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })
                            : "Never"}
                        </td>
                        <td className="px-6 py-4 align-middle text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2.5 text-xs text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                            onClick={() => setSelectedRecord(record)}
                          >
                            <Eye className="h-3 w-3" />
                            Logs
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination */}
            {!tabLoading && totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3">
                <span className="text-xs text-zinc-500">
                  Page {page} of {totalPages} &middot; {currentTotal} total
                  {tabRefreshing && <span className="ml-2 text-[#2e3192]">Updating…</span>}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs border-zinc-200"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs border-zinc-200"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB CONTENT: Review Requests ───────────────────────────────── */}
      {activeTab === "reviews" && (
        <Card className="shadow-[var(--shadow-card)] border-zinc-200">
          <CardHeader className="space-y-4 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Submitted Review Requests</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Newest submissions first. Approve retakes or reject requests from failed users.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Status
              </span>
              <FilterPill active={reviewFilter === "all"} onClick={() => handleReviewFilterChange("all")}>
                All
              </FilterPill>
              <FilterPill active={reviewFilter === "Pending"} onClick={() => handleReviewFilterChange("Pending")}>
                Pending
              </FilterPill>
              <FilterPill active={reviewFilter === "Approved"} onClick={() => handleReviewFilterChange("Approved")}>
                Approved
              </FilterPill>
              <FilterPill active={reviewFilter === "Rejected"} onClick={() => handleReviewFilterChange("Rejected")}>
                Rejected
              </FilterPill>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {tabLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#2e3192]" />
                Loading reviews…
              </div>
            ) : reviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <ClipboardList className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
                <p className="text-sm font-medium text-zinc-500">No review requests found</p>
                <p className="text-xs text-zinc-400">
                  Review requests will appear here when failed employees submit their explanations.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-medium text-zinc-500">
                      <th className="px-6 py-3">User</th>
                      <th className="px-6 py-3">Assessment</th>
                      <th className="px-6 py-3 text-center">Warnings</th>
                      <th className="px-6 py-3">Submission Date</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((req, i) => (
                      <tr
                        key={req.id}
                        className={`border-b border-zinc-50 transition-colors hover:bg-zinc-50/50 ${
                          i === reviews.length - 1 ? "border-0" : ""
                        }`}
                      >
                        <td className="px-6 py-4 align-middle">
                          <p className="font-semibold text-zinc-800 text-xs">{req.username}</p>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <p className="font-medium text-zinc-800 text-xs">{req.moduleTitle}</p>
                          <p className="font-mono text-[9px] text-zinc-400">ID: {req.moduleId}</p>
                        </td>
                        <td className="px-6 py-4 align-middle text-center font-semibold text-xs text-red-600">
                          {req.warningCount}
                        </td>
                        <td className="px-6 py-4 align-middle text-xs text-zinc-500 tabular-nums">
                          {new Date(req.submittedTimestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                              req.status === "Pending"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : req.status === "Approved"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-middle text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                            onClick={() => {
                              setSelectedReview(req);
                              setShowRejectForm(false);
                              setActionError("");
                              setAdminComment("");
                            }}
                          >
                            Manage Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB CONTENT: Audit Trail Logs ──────────────────────────────── */}
      {activeTab === "audit" && (
        <Card className="shadow-[var(--shadow-card)] border-zinc-200">
          <CardHeader className="space-y-4 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Compliance Audit Trail Logs</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Chronological log of integrity events, newest first.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Event type
              </span>
              <FilterPill active={auditFilter === "all"} onClick={() => handleAuditFilterChange("all")}>
                All events
              </FilterPill>
              <FilterPill active={auditFilter === "warnings"} onClick={() => handleAuditFilterChange("warnings")}>
                Warnings
              </FilterPill>
              <FilterPill active={auditFilter === "failures"} onClick={() => handleAuditFilterChange("failures")}>
                Failures
              </FilterPill>
              <FilterPill active={auditFilter === "retakes"} onClick={() => handleAuditFilterChange("retakes")}>
                Retakes
              </FilterPill>
              <FilterPill active={auditFilter === "reviews"} onClick={() => handleAuditFilterChange("reviews")}>
                Reviews
              </FilterPill>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {tabLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#2e3192]" />
                Loading audit logs…
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <FileClock className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
                <p className="text-sm font-medium text-zinc-500">No audit logs recorded</p>
                <p className="text-xs text-zinc-400">
                  Logs will populate automatically as compliance actions take place.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-medium text-zinc-500">
                      <th className="px-6 py-3">Timestamp</th>
                      <th className="px-6 py-3">Action Type</th>
                      <th className="px-6 py-3">Operator</th>
                      <th className="px-6 py-3">Details / Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => (
                      <tr
                        key={log.id}
                        className={`border-b border-zinc-50 transition-colors hover:bg-zinc-50/50 ${
                          i === auditLogs.length - 1 ? "border-0" : ""
                        }`}
                      >
                        <td className="px-6 py-4 align-middle text-xs text-zinc-500 tabular-nums font-mono">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-bold ${
                              log.action.includes("Approved") || log.action.includes("Granted") || log.action.includes("Completed")
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : log.action.includes("Rejected") || log.action.includes("Failed") || log.action.includes("Limit")
                                  ? "bg-red-50 text-red-800 border-red-200"
                                  : log.action.includes("Submitted") || log.action.includes("Warning")
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-middle text-xs font-semibold text-zinc-700">
                          {log.admin}
                        </td>
                        <td className="px-6 py-4 align-middle text-xs text-zinc-600 max-w-md break-words">
                          {log.details || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Inspection Warning Logs Modal ───────────────────────────────────── */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Integrity Violation Logs</h3>
                <p className="text-xs text-zinc-500">
                  User: <span className="font-semibold text-zinc-700">{selectedRecord.username}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full text-zinc-400 hover:text-zinc-500 hover:bg-zinc-100"
                onClick={() => setSelectedRecord(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-5 py-4 space-y-4 flex-1">
              <div className="grid grid-cols-3 gap-4 text-xs border-b border-zinc-100 pb-3">
                <div>
                  <p className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Assessment</p>
                  <p className="font-medium text-zinc-800 mt-0.5">{selectedRecord.moduleTitle}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Warnings</p>
                  <p className="font-medium text-zinc-800 mt-0.5">
                    {selectedRecord.warningCount} / 3 warnings
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Retakes Used</p>
                  <p className="font-medium text-zinc-850 mt-0.5 font-bold">
                    {selectedRecord.retakeCount || 0} / 2
                  </p>
                </div>
              </div>

              {/* Warnings timeline */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Current Session Warning History</p>
                {selectedRecord.warningHistory && selectedRecord.warningHistory.length > 0 ? (
                  <div className="relative border-l border-zinc-100 pl-4 ml-2 space-y-3 py-1 max-h-36 overflow-y-auto">
                    {selectedRecord.warningHistory.map((warning, index) => (
                      <div key={index} className="relative">
                        <div className="absolute -left-[21px] mt-1 h-2 w-2 rounded-full bg-amber-500 border border-white ring-2 ring-amber-100" />
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                          <p className="text-xs font-semibold text-zinc-800">{warning.reason}</p>
                          <p className="text-[10px] text-zinc-400 tabular-nums">
                            {new Date(warning.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-md">
                    No active warnings logged for this attempt.
                  </div>
                )}
              </div>

              {/* Historical/Archived Warnings */}
              {selectedRecord.archivedWarnings && selectedRecord.archivedWarnings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Archived Warnings (Previous Attempts)</p>
                  <div className="space-y-3 max-h-36 overflow-y-auto pr-1">
                    {selectedRecord.archivedWarnings.map((archive, archIdx) => (
                      <div key={archIdx} className="bg-zinc-50 rounded-md p-2.5 border border-zinc-100 space-y-1.5">
                        <p className="text-[10px] font-bold text-zinc-600 flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3 text-zinc-400" />
                          Retake Attempt #{archive.attempt} warnings
                        </p>
                        <div className="space-y-1 font-mono text-[9px] text-zinc-500 pl-3 border-l border-zinc-200">
                          {archive.warnings.map((w, wIdx) => (
                            <div key={wIdx} className="flex justify-between">
                              <span className="font-sans text-zinc-700">{w.reason}</span>
                              <span>{new Date(w.timestamp).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compliance Attestation (Acknowledgement) Details */}
              <div className="bg-zinc-50 rounded-md p-3 border border-zinc-200/60 space-y-2">
                <p className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Compliance Attestation & Acknowledgement
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-zinc-500 font-medium">Acknowledged:</span>{" "}
                    <span className={`font-semibold ${selectedRecord.acknowledgement?.accepted ? "text-emerald-700" : "text-zinc-500"}`}>
                      {selectedRecord.acknowledgement?.accepted ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-medium">Timestamp:</span>{" "}
                    <span className="font-mono text-zinc-700 text-[11px]">
                      {selectedRecord.acknowledgement?.timestamp
                        ? new Date(selectedRecord.acknowledgement.timestamp).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                </div>
                {selectedRecord.acknowledgement && (
                  <div className="pt-1.5 border-t border-zinc-200 mt-1.5 space-y-2">
                    <div className="text-[9px] text-zinc-400 space-y-0.5 font-mono">
                      <p>Signer: {selectedRecord.acknowledgement.userName}</p>
                      {(selectedRecord.acknowledgement.signerEmail ||
                        selectedRecord.acknowledgement.userId) && (
                        <p>
                          Account:{" "}
                          {selectedRecord.acknowledgement.signerEmail ??
                            selectedRecord.acknowledgement.userId}
                        </p>
                      )}
                      <p>Assessment: {selectedRecord.acknowledgement.assessmentName}</p>
                    </div>
                    {selectedRecord.acknowledgement.digitalSignature && (
                      <div className="rounded border border-zinc-200 bg-white p-2">
                        <p className="text-[10px] font-medium text-zinc-500 mb-1">
                          Electronic signature
                        </p>
                        <img
                          src={selectedRecord.acknowledgement.digitalSignature}
                          alt={`Signature: ${selectedRecord.acknowledgement.userName}`}
                          className="max-h-24 w-auto"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Score-based failure (below passing threshold) */}
              {selectedRecord.scorePercent != null &&
                selectedRecord.scorePercent < 70 &&
                !selectedRecord.acknowledgement?.accepted && (
                <div className="rounded-md bg-amber-50 border border-amber-100 p-3 text-xs">
                  <p className="font-semibold text-amber-900 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" />
                    Below passing score ({selectedRecord.scorePercent}%)
                  </p>
                  <p className="text-amber-800 mt-0.5 leading-relaxed">
                    {selectedRecord.failedReason ??
                      selectedRecord.lastFailureReason ??
                      "Learner did not reach the 70% threshold."}
                  </p>
                  {selectedRecord.lastFailureAt && (
                    <p className="text-[9px] text-amber-600 mt-1 tabular-nums">
                      Last recorded:{" "}
                      {new Date(selectedRecord.lastFailureAt).toLocaleString()}
                    </p>
                  )}
                  <p className="text-[9px] text-amber-700/90 mt-1">
                    Retakes used: {selectedRecord.retakeCount ?? 0} / 2
                  </p>
                </div>
              )}

              {/* Failure status explanation */}
              {(selectedRecord.status === "failed" || selectedRecord.status === "permanently_failed") && (
                <div className="rounded-md bg-red-50 border border-red-100 p-3 text-xs">
                  <p className="font-semibold text-red-800 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" />
                    {selectedRecord.status === "permanently_failed"
                      ? "Assessment Permanently Failed"
                      : "Automatic Failure Locked"}
                  </p>
                  <p className="text-red-700 mt-0.5">
                    Reason: {selectedRecord.failedReason || "Maximum warning limit reached."}
                  </p>
                  {selectedRecord.lastFailureAt && (
                    <p className="text-[9px] text-red-500 mt-1">
                      Failure Date: {new Date(selectedRecord.lastFailureAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-zinc-100 px-5 py-3 flex justify-end bg-zinc-50/50">
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-zinc-700 border-zinc-200"
                onClick={() => setSelectedRecord(null)}
              >
                Close Logs
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Review Details Drawer Modal ─────────────────────────────── */}
      {selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Review Request Panel</h3>
                <p className="text-xs text-zinc-400">
                  Evaluate explanations for compliance failure locks
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full text-zinc-400 hover:text-zinc-500 hover:bg-zinc-100"
                onClick={() => {
                  setSelectedReview(null);
                  setShowRejectForm(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-5 py-4 space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4 text-xs border-b border-zinc-100 pb-3">
                <div>
                  <p className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">User & ID</p>
                  <p className="font-bold text-zinc-800 mt-0.5">{selectedReview.username}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Module Title</p>
                  <p className="font-medium text-zinc-800 mt-0.5">{selectedReview.moduleTitle}</p>
                </div>
              </div>

              {/* Employee Explanation */}
              <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 space-y-1 text-xs">
                <p className="font-bold text-zinc-700">User&apos;s Explanation for Violations:</p>
                <p className="text-zinc-600 italic leading-relaxed">
                  &ldquo;{selectedReview.userExplanation || "No comments provided."}&rdquo;
                </p>
                <p className="text-[9px] text-zinc-400 pt-1 text-right">
                  Submitted: {new Date(selectedReview.submittedTimestamp).toLocaleString()}
                </p>
              </div>

              {/* Status details display */}
              {selectedReview.status !== "Pending" && (
                <div className={`rounded-md p-3 text-xs space-y-1 ${
                  selectedReview.status === "Approved"
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-150"
                    : "bg-red-50 text-red-900 border border-red-150"
                }`}>
                  <p className="font-bold flex items-center gap-1">
                    {selectedReview.status === "Approved" ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        Retake Approved
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        Retake Request Rejected
                      </>
                    )}
                  </p>
                  <p className="text-[11px]">
                    {selectedReview.status === "Approved"
                      ? `Approved by ${selectedReview.approvedBy} on ${new Date(selectedReview.approvedAt || 0).toLocaleString()}`
                      : `Rejected by ${selectedReview.rejectedBy} on ${new Date(selectedReview.rejectedAt || 0).toLocaleString()}`}
                  </p>
                  {selectedReview.adminComment && (
                    <p className="mt-1 leading-normal italic text-[11px]">
                      Comment: &ldquo;{selectedReview.adminComment}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {actionError && (
                <p className="text-xs text-red-600 font-semibold">{actionError}</p>
              )}

              {/* Rejection input toggle */}
              {selectedReview.status === "Pending" && showRejectForm && (
                <form onSubmit={(e) => handleRejectSubmit(e, selectedReview.id)} className="space-y-3 pt-2 text-left border-t border-zinc-100">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">Admin Decision Comment (Required)</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-zinc-200 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#2e3192]"
                      placeholder="Explain why this request is rejected (e.g. 'Violation patterns indicate multiple tabs switched with no clear reasoning')."
                      value={adminComment}
                      onChange={(e) => setAdminComment(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setShowRejectForm(false);
                        setAdminComment("");
                        setActionError("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="flex-1 bg-red-600 text-white hover:bg-red-750 text-xs"
                    >
                      Confirm Rejection
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {selectedReview.status === "Pending" && !showRejectForm && (
              <div className="border-t border-zinc-100 px-5 py-4 flex gap-2 justify-end bg-zinc-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setShowRejectForm(true)}
                >
                  Reject Request
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold"
                  onClick={() => void handleApprove(selectedReview.id)}
                >
                  Approve Retake
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

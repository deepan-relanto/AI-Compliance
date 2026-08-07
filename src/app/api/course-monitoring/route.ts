import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  getMonitoringSummary,
  listMonitoringViolationsPaged,
  listMonitoringReviewsPaged,
  listMonitoringAuditLogsPaged,
  type AuditActionFilter,
  type MonitoringSort,
  type ReviewStatusFilter,
  type ViolationStatusFilter,
} from "@/lib/services/course-monitoring-db-service";
import { swrLoad, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const SOFT = 45;
const HARD = 135;

const VIOLATION_FILTERS = new Set<ViolationStatusFilter>([
  "all",
  "in_progress",
  "completed",
  "failed",
  "permanently_failed",
  "with_warnings",
]);

const REVIEW_FILTERS = new Set<ReviewStatusFilter>([
  "all",
  "Pending",
  "Approved",
  "Rejected",
]);

const AUDIT_FILTERS = new Set<AuditActionFilter>([
  "all",
  "failures",
  "retakes",
  "reviews",
  "warnings",
]);

const SORT_MODES = new Set<MonitoringSort>(["time", "warnings"]);

/** GET /api/course-monitoring — course-only monitoring (separate tables). */
export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const tab = (searchParams.get("tab") ?? "violations") as
      | "violations"
      | "reviews"
      | "audit";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)),
    );
    const summaryOnly = searchParams.get("summary") === "1";
    const filterParam = searchParams.get("filter") ?? "all";
    const moduleId = searchParams.get("moduleId") ?? "";
    const sortParam = (searchParams.get("sort") ?? "time") as MonitoringSort;

    const sql = getSql();

    if (summaryOnly) {
      const { data, status } = await swrLoad(
        CACHE_KEYS.courseMonitoringSummary,
        SOFT,
        HARD,
        () => getMonitoringSummary(sql),
      );
      return NextResponse.json(
        { ok: true, ...data },
        { headers: { "X-Cache": status } },
      );
    }

    if (tab === "violations") {
      const statusFilter = VIOLATION_FILTERS.has(filterParam as ViolationStatusFilter)
        ? (filterParam as ViolationStatusFilter)
        : "all";
      const sort = SORT_MODES.has(sortParam) ? sortParam : "time";
      const cacheKey = CACHE_KEYS.courseMonitoringViolations(
        page,
        statusFilter,
        moduleId,
        sort,
      );
      const { data, status } = await swrLoad(cacheKey, SOFT, HARD, () =>
        listMonitoringViolationsPaged(sql, page, pageSize, {
          statusFilter,
          moduleId: moduleId || undefined,
          sort,
        }),
      );
      return NextResponse.json(
        {
          ok: true,
          ...data,
          page,
          pageSize,
          filter: statusFilter,
          moduleId: moduleId || null,
          sort,
        },
        { headers: { "X-Cache": status } },
      );
    }

    if (tab === "reviews") {
      const statusFilter = REVIEW_FILTERS.has(filterParam as ReviewStatusFilter)
        ? (filterParam as ReviewStatusFilter)
        : "all";
      const cacheKey = CACHE_KEYS.courseMonitoringReviews(page, statusFilter);
      const { data, status } = await swrLoad(cacheKey, SOFT, HARD, () =>
        listMonitoringReviewsPaged(sql, page, pageSize, statusFilter),
      );
      return NextResponse.json(
        {
          ok: true,
          ...data,
          page,
          pageSize,
          filter: statusFilter,
        },
        { headers: { "X-Cache": status } },
      );
    }

    if (tab === "audit") {
      const actionFilter = AUDIT_FILTERS.has(filterParam as AuditActionFilter)
        ? (filterParam as AuditActionFilter)
        : "all";
      const cacheKey = CACHE_KEYS.courseMonitoringAudit(page, actionFilter);
      const { data, status } = await swrLoad(cacheKey, SOFT, HARD, () =>
        listMonitoringAuditLogsPaged(sql, page, pageSize, actionFilter),
      );
      return NextResponse.json(
        {
          ok: true,
          ...data,
          page,
          pageSize,
          filter: actionFilter,
        },
        { headers: { "X-Cache": status } },
      );
    }

    return NextResponse.json({ ok: false, error: "Invalid tab" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load course monitoring data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

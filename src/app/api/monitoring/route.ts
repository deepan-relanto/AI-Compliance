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
} from "@/lib/services/monitoring-db-service";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

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

/**
 * GET /api/monitoring
 *   ?tab=violations|reviews|audit   (default: violations)
 *   ?page=N                         (default: 1)
 *   ?pageSize=N                     (default: 25, max: 100)
 *   ?summary=1                      (return only KPI summary)
 *   ?filter=...                     (status/action filter per tab)
 *   ?moduleId=...                   (violations: assessment filter)
 *   ?sort=time|warnings             (violations sort; default time)
 */
export async function GET(req: NextRequest) {
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
      const cacheKey = CACHE_KEYS.monitoringSummary;
      const cached = cacheGet<object>(cacheKey);
      if (cached) return NextResponse.json({ ok: true, ...cached });

      const summary = await getMonitoringSummary(sql);
      cacheSet(cacheKey, summary, 30);
      return NextResponse.json({ ok: true, ...summary });
    }

    if (tab === "violations") {
      const statusFilter = VIOLATION_FILTERS.has(filterParam as ViolationStatusFilter)
        ? (filterParam as ViolationStatusFilter)
        : "all";
      const sort = SORT_MODES.has(sortParam) ? sortParam : "time";
      const cacheKey = CACHE_KEYS.monitoringViolations(
        page,
        statusFilter,
        moduleId,
        sort,
      );
      const cached = cacheGet<object>(cacheKey);
      if (cached) return NextResponse.json({ ok: true, ...cached });

      const data = await listMonitoringViolationsPaged(sql, page, pageSize, {
        statusFilter,
        moduleId: moduleId || undefined,
        sort,
      });
      cacheSet(cacheKey, data, 30);
      return NextResponse.json({
        ok: true,
        ...data,
        page,
        pageSize,
        filter: statusFilter,
        moduleId: moduleId || null,
        sort,
      });
    }

    if (tab === "reviews") {
      const statusFilter = REVIEW_FILTERS.has(filterParam as ReviewStatusFilter)
        ? (filterParam as ReviewStatusFilter)
        : "all";
      const cacheKey = CACHE_KEYS.monitoringReviews(page, statusFilter);
      const cached = cacheGet<object>(cacheKey);
      if (cached) return NextResponse.json({ ok: true, ...cached });

      const data = await listMonitoringReviewsPaged(sql, page, pageSize, statusFilter);
      cacheSet(cacheKey, data, 30);
      return NextResponse.json({
        ok: true,
        ...data,
        page,
        pageSize,
        filter: statusFilter,
      });
    }

    if (tab === "audit") {
      const actionFilter = AUDIT_FILTERS.has(filterParam as AuditActionFilter)
        ? (filterParam as AuditActionFilter)
        : "all";
      const cacheKey = CACHE_KEYS.monitoringAudit(page, actionFilter);
      const cached = cacheGet<object>(cacheKey);
      if (cached) return NextResponse.json({ ok: true, ...cached });

      const data = await listMonitoringAuditLogsPaged(sql, page, pageSize, actionFilter);
      cacheSet(cacheKey, data, 30);
      return NextResponse.json({
        ok: true,
        ...data,
        page,
        pageSize,
        filter: actionFilter,
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid tab" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load monitoring data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

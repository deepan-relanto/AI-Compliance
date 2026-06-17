import { getSql } from "@/lib/db";
import {
  getMonitoringSummary,
  getMonitoringTabPayload,
} from "@/lib/services/monitoring-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — violations, review requests, and audit logs for admin monitoring */
export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const tabParam = req.nextUrl.searchParams.get("tab");
    const tab = tabParam === "reviews" || tabParam === "audit" ? tabParam : "violations";
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "25");

    const [summary, data] = await Promise.all([
      getMonitoringSummary(sql),
      getMonitoringTabPayload(sql, tab, page, pageSize),
    ]);

    return NextResponse.json({
      ok: true,
      summary,
      tab,
      ...data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load monitoring data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

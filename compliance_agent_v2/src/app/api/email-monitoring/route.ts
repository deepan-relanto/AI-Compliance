import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  getEmailMonitoring,
  type EmailEventType,
  type EmailMonitoringTrack,
} from "@/lib/services/email-monitoring-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set<EmailEventType>([
  "invited",
  "completed",
  "reminder",
  "failed_review_guidance",
  "retake_approved",
]);

/** GET — admin email outreach monitoring log */
export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const trackParam = req.nextUrl.searchParams.get("track");
    const track: EmailMonitoringTrack =
      trackParam === "compliance" || trackParam === "course" || trackParam === "all"
        ? trackParam
        : "all";
    const batchId = req.nextUrl.searchParams.get("batchId");
    const typeParam = req.nextUrl.searchParams.get("type");
    const type =
      typeParam && EVENT_TYPES.has(typeParam as EmailEventType)
        ? (typeParam as EmailEventType)
        : "all";
    const search = req.nextUrl.searchParams.get("q");
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 300);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 300;

    const sql = getSql();
    const data = await getEmailMonitoring(sql, {
      track,
      batchId,
      type,
      search,
      limit,
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load email monitoring";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

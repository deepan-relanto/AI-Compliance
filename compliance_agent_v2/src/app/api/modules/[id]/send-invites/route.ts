import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";
import {
  sendFailedReviewGuidanceEmails,
  sendModuleInvitationEmails,
} from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — invitation / reminder / failed-review guidance emails (admin). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const forceResend =
    body?.forceResend === true ||
    body?.forceResend === "1" ||
    body?.forceResend === "true" ||
    req.nextUrl.searchParams.get("forceResend") === "1" ||
    req.nextUrl.searchParams.get("forceResend") === "true";
  const batchId =
    typeof body?.batchId === "string" && body.batchId.trim()
      ? body.batchId.trim()
      : undefined;
  const mode = typeof body?.mode === "string" ? body.mode : "";
  const reminderOnlyNotStarted =
    mode === "course_not_started_reminder" ||
    mode === "not_started_reminder" ||
    body?.reminderOnlyNotStarted === true;
  const failedReviewGuidance =
    mode === "failed_review_guidance" ||
    mode === "course_failed_review_guidance";
  const triggeredBy =
    typeof session?.user?.email === "string"
      ? session.user.email
      : undefined;

  const sql = getSql();

  if (failedReviewGuidance) {
    const result = await sendFailedReviewGuidanceEmails(sql, id, {
      forceResend,
      batchId,
      triggeredBy,
    });
    invalidateAdminCaches();
    return NextResponse.json(result);
  }

  const result = await sendModuleInvitationEmails(sql, id, {
    forceResend,
    batchId,
    reminderOnlyNotStarted,
    triggeredBy,
  });
  // Email monitoring reads through a 180s cache; without this the admin would not
  // see the send they just triggered.
  invalidateAdminCaches();
  return NextResponse.json(result);
}

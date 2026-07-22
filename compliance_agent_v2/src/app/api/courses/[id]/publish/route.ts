import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";
import type { InviteSendResult } from "@/lib/invite-result";
import { publishCourseModuleDb } from "@/lib/services/course-service";
import { sendModuleInvitationEmails } from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildPublishResponse(
  invites: InviteSendResult,
  baseMessage: string,
): { ok: boolean; message: string; invites: InviteSendResult; emailWarning: string | null } {
  const emailWarning =
    invites.sent === 0
      ? invites.failed > 0
        ? invites.message
        : invites.message
      : invites.failed > 0
        ? `${invites.failed} invitation email(s) failed.`
        : null;

  const message =
    invites.sent > 0
      ? `${baseMessage} ${invites.message}`
      : emailWarning
        ? `${baseMessage} ${emailWarning}`
        : `${baseMessage} ${invites.message}`;

  return {
    ok: true,
    message: message.trim(),
    invites,
    emailWarning,
  };
}

/** POST — assign batches, publish a complete course bundle, and email learners */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await req.json();
    const batchIds = Array.isArray(body.batchIds) ? body.batchIds : [];

    const sql = getSql();
    await publishCourseModuleDb(sql, id, batchIds);
    invalidateAdminCaches();

    const invites = await sendModuleInvitationEmails(sql, id);
    return NextResponse.json(
      buildPublishResponse(invites, "Course assigned to selected batches."),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

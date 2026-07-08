import { getSql } from "@/lib/db";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";
import { publishCourseModuleDb } from "@/lib/services/course-service";
import { sendModuleInvitationEmails } from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — assign batches, publish a complete course bundle, and email learners */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const batchIds = Array.isArray(body.batchIds) ? body.batchIds : [];

    const sql = getSql();
    await publishCourseModuleDb(sql, id, batchIds);
    invalidateAdminCaches();

    const invites = await sendModuleInvitationEmails(sql, id);
    const message =
      invites.sent > 0
        ? `Course published. ${invites.message}`
        : invites.failed > 0
          ? `Course published, but email failed: ${invites.message}`
          : `Course published to selected batches. ${invites.message}`;

    return NextResponse.json({
      ok: true,
      message,
      invites,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

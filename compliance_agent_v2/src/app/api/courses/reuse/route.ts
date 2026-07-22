import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";
import { reuseCourseModuleDb } from "@/lib/services/course-service";
import { sendModuleInvitationEmails } from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — clone a published course bundle to new batches and email learners */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const body = await req.json();
    const { sourceModuleId, title, description, batchIds } = body;

    if (!sourceModuleId || !title?.trim()) {
      return NextResponse.json(
        { ok: false, message: "sourceModuleId and title are required." },
        { status: 400 },
      );
    }
    if (!Array.isArray(batchIds) || batchIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Select at least one batch." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const sourceRows = await sql`
      SELECT title FROM course_modules
      WHERE id = ${String(sourceModuleId)}
      LIMIT 1
    `;
    if (sourceRows.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Source course not found." },
        { status: 400 },
      );
    }

    const sourceTitle = String(sourceRows[0].title ?? "").trim();
    const trimmedTitle = title.trim();
    if (sourceTitle.toLowerCase() === trimmedTitle.toLowerCase()) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Use "Assign & email batches" to send the existing bundle without creating a duplicate. Choose a different title only if you need a separate copy.',
        },
        { status: 400 },
      );
    }

    const result = await reuseCourseModuleDb(sql, {
      sourceModuleId,
      title: trimmedTitle,
      description: typeof description === "string" ? description : undefined,
      batchIds,
    });

    invalidateAdminCaches();
    const invites = await sendModuleInvitationEmails(sql, result.id);

    const emailWarning =
      invites.sent === 0
        ? invites.message
        : invites.failed > 0
          ? `${invites.failed} invitation email(s) failed.`
          : null;

    const message =
      invites.sent > 0
        ? `Course "${trimmedTitle}" cloned with ${result.mcqCount} question(s). ${invites.message}`
        : emailWarning
          ? `Course "${trimmedTitle}" cloned. ${emailWarning}`
          : `Course "${trimmedTitle}" cloned with ${result.mcqCount} question(s). ${invites.message}`;

    return NextResponse.json({
      ok: true,
      moduleId: result.id,
      mcqCount: result.mcqCount,
      message,
      invites,
      emailWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reuse failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { markAssessmentCompletedDb } from "@/lib/services/course-progress-db-service";
import { sendModuleCompletionEmail } from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — mark assessment completed after feedback (acknowledgement already saved). */
export async function POST(req: NextRequest) {
  try {
    const { userEmail, moduleId } = await req.json();
    if (!moduleId) {
      return NextResponse.json(
        { ok: false, message: "moduleId is required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const marked = await markAssessmentCompletedDb(sql, access.email, moduleId);
    if (!marked) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Assessment cannot be finalized. A passing score and attestation are required.",
        },
        { status: 400 },
      );
    }

    const emailResult = await sendModuleCompletionEmail(sql, access.email, moduleId);
    if (!emailResult.ok) {
      console.error("[progress complete email]", access.email, moduleId, emailResult.message);
    }

    return NextResponse.json({
      ok: true,
      emailSent: emailResult.emailSent,
      emailMessage: emailResult.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete assessment";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}


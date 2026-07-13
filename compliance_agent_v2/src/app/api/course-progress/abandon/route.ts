import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { failAssessmentAbandonmentDb } from "@/lib/services/course-progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — mark an active attempt as failed when the learner abandons the session */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userEmail, moduleId, reason } = body;

    if (!moduleId) {
      return NextResponse.json(
        { ok: false, message: "moduleId is required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const result = await failAssessmentAbandonmentDb(sql, {
      userEmail: access.email,
      moduleId: String(moduleId),
      reason: typeof reason === "string" ? reason : undefined,
    });

    return NextResponse.json({ ok: result.ok, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to abandon assessment";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}


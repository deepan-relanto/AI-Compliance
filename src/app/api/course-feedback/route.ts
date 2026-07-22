import { requireAdminSession } from "@/lib/api-admin";
import { requireLearnerModuleAccess, requireSessionEmail } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { getUserBatchMap } from "@/lib/services/feedback-db-service";
import {
  createCourseFeedback,
  listCourseFeedback,
} from "@/lib/services/course-feedback-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — all course feedback with batch info */
export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const sql = getSql();
    const [entries, userBatches] = await Promise.all([
      listCourseFeedback(sql),
      getUserBatchMap(sql),
    ]);
    return NextResponse.json({ ok: true, entries, userBatches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load course feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST — persist new learner course feedback (identity always from session) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, userName, assessmentId, assessmentName, feedbackText, id } = body;

    if (!assessmentId || !assessmentName || !feedbackText?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 },
      );
    }

    const session = await requireSessionEmail(userId);
    if (!session.ok) return session.response;

    const access = await requireLearnerModuleAccess(String(assessmentId), session.email);
    if (!access.ok) return access.response;

    const sql = getSql();
    const entry = await createCourseFeedback(sql, {
      id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: access.email,
      userName: typeof userName === "string" && userName.trim() ? userName.trim() : access.email,
      assessmentId: String(assessmentId),
      assessmentName: String(assessmentName),
      feedbackText: feedbackText.trim(),
    });

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save course feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

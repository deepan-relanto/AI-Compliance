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

/** POST — persist new learner course feedback */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, userName, assessmentId, assessmentName, feedbackText, id } = body;

    if (!userId || !assessmentId || !assessmentName || !feedbackText?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const entry = await createCourseFeedback(sql, {
      id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      userName: userName ?? userId,
      assessmentId,
      assessmentName,
      feedbackText: feedbackText.trim(),
    });

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save course feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

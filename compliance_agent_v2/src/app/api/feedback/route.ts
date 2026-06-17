import { getSql } from "@/lib/db";
import type { ModuleKind } from "@/lib/module-kind";
import {
  createFeedback,
  getUserBatchMap,
  listFeedback,
} from "@/lib/services/feedback-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — feedback with optional ?track=compliance|course */
export async function GET(req: NextRequest) {
  try {
    const trackParam = req.nextUrl.searchParams.get("track");
    const track: ModuleKind | undefined =
      trackParam === "course" ? "course" : trackParam === "compliance" ? "compliance" : undefined;
    const sql = getSql();
    const [entries, userBatches] = await Promise.all([
      listFeedback(sql, track),
      getUserBatchMap(sql),
    ]);
    return NextResponse.json({ ok: true, entries, userBatches, track: track ?? "all" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST — persist new learner feedback */
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
    const entry = await createFeedback(sql, {
      id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      userName: userName ?? userId,
      assessmentId,
      assessmentName,
      feedbackText: feedbackText.trim(),
    });

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save feedback";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

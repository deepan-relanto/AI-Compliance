import { requireLearnerModuleAccess, requireSessionEmail } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import {
  listProgressForUser,
  startTrainingSessionDb,
} from "@/lib/services/course-progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET ?userEmail= — learner progress with scores */
export async function GET(req: NextRequest) {
  try {
    const claimedEmail = req.nextUrl.searchParams.get("userEmail");
    const access = await requireSessionEmail(claimedEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const progress = await listProgressForUser(sql, access.email);
    return NextResponse.json({ ok: true, progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load progress";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/** POST — ensure progress row or update slide position */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userEmail,
      moduleId,
      moduleTitle,
      batchId,
      totalSlides,
      currentSlide,
      assignedMcqCount,
      freshStart,
    } = body;

    if (!moduleId || !moduleTitle) {
      return NextResponse.json(
        { ok: false, message: "moduleId and moduleTitle required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const row = await startTrainingSessionDb(sql, {
      userEmail: access.email,
      moduleId,
      moduleTitle,
      batchId: batchId || access.batchId,
      totalSlides: totalSlides ?? 1,
      assignedMcqCount:
        typeof assignedMcqCount === "number" && assignedMcqCount > 0
          ? assignedMcqCount
          : undefined,
      freshStart: Boolean(freshStart),
      currentSlide: typeof currentSlide === "number" ? currentSlide : undefined,
    });

    return NextResponse.json({ ok: true, progress: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save progress";
    const blocked =
      message.includes("failed") || message.includes("administrator");
    return NextResponse.json(
      { ok: false, message },
      { status: blocked ? 409 : 500 },
    );
  }
}


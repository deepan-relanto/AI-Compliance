import { requireLearnerModuleAccess } from "@/lib/api-session";
import { parseCourseResumeCheckpoint } from "@/lib/course-resume";
import { getSql } from "@/lib/db";
import { CACHE_KEYS, invalidateCache } from "@/lib/api-cache";
import { saveResumeCheckpointDb } from "@/lib/services/course-progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — save course resume checkpoint (Save & Exit / autosave). Does not fail the attempt. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userEmail,
      moduleId,
      moduleTitle,
      batchId,
      totalSlides,
      checkpoint: rawCheckpoint,
    } = body;

    if (!moduleId || !moduleTitle) {
      return NextResponse.json(
        { ok: false, message: "moduleId and moduleTitle required." },
        { status: 400 },
      );
    }

    const checkpoint = parseCourseResumeCheckpoint({
      ...(rawCheckpoint && typeof rawCheckpoint === "object" ? rawCheckpoint : {}),
      savedAt: new Date().toISOString(),
    });
    if (!checkpoint) {
      return NextResponse.json(
        { ok: false, message: "Invalid resume checkpoint." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const result = await saveResumeCheckpointDb(sql, {
      userEmail: access.email,
      moduleId,
      moduleTitle,
      batchId: typeof batchId === "string" ? batchId : access.batchId,
      totalSlides:
        typeof totalSlides === "number" && totalSlides > 0 ? totalSlides : 1,
      checkpoint,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message ?? "Could not save progress." },
        { status: 409 },
      );
    }

    // Narrow bust — autosave must not wipe every warm module detail entry.
    invalidateCache(`learner-dashboard:${access.email.toLowerCase()}`);
    invalidateCache(CACHE_KEYS.moduleDetail(moduleId, access.email));

    return NextResponse.json({
      ok: true,
      checkpoint: result.checkpoint,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save course progress";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

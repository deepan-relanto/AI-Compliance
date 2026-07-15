import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { invalidateAdminCachesAsync } from "@/lib/invalidate-admin-cache";
import { validateAndRecordMcqAnswerDb as validateCourseMcqAnswerDb } from "@/lib/services/course-progress-db-service";
import { validateAndRecordMcqAnswerDb as validateComplianceMcqAnswerDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — validate MCQ answer and record score progress */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  try {
    const { id: moduleId, questionId } = await params;
    const body = await req.json();
    const {
      optionId,
      optionIds,
      userEmail,
      moduleTitle,
      batchId,
      totalSlides,
      assignedMcqCount,
    } = body;

    const normalizedOptionIds = Array.isArray(optionIds)
      ? optionIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (!optionId && normalizedOptionIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "optionId or optionIds is required." },
        { status: 400 },
      );
    }

    if (!moduleTitle) {
      return NextResponse.json(
        { ok: false, error: "moduleTitle is required." },
        { status: 400 },
      );
    }

    // Access check is TTL-cached after the first hit of this quiz session.
    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const courseModule = moduleId.startsWith("course-");
    const validateMcq = courseModule
      ? validateCourseMcqAnswerDb
      : validateComplianceMcqAnswerDb;

    const result = await validateMcq(sql, {
      userEmail: access.email,
      moduleId,
      moduleTitle,
      batchId: batchId || access.batchId,
      totalSlides: totalSlides ?? 1,
      questionId,
      optionId: typeof optionId === "string" ? optionId : undefined,
      optionIds: normalizedOptionIds.length > 0 ? normalizedOptionIds : undefined,
      assignedMcqCount:
        typeof assignedMcqCount === "number" && assignedMcqCount > 0
          ? assignedMcqCount
          : undefined,
    });

    if (!result.found) {
      return NextResponse.json(
        { ok: false, error: "Question not found." },
        { status: 404 },
      );
    }

    if (!result.alreadyAnswered) {
      invalidateAdminCachesAsync();
    }

    return NextResponse.json({
      ok: true,
      correct: result.correct,
      correctOptionId: result.correctOptionId,
      mcqCorrect: result.mcqCorrect,
      mcqTotal: result.mcqTotal,
      alreadyAnswered: result.alreadyAnswered,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

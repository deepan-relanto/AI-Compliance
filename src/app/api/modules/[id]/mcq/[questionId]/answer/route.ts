import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { validateAndRecordMcqAnswerDb } from "@/lib/services/progress-db-service";
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
      userEmail,
      moduleTitle,
      batchId,
      totalSlides,
      assignedMcqCount,
    } = body;

    if (!optionId || typeof optionId !== "string") {
      return NextResponse.json(
        { ok: false, error: "optionId is required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    if (!moduleTitle) {
      return NextResponse.json(
        { ok: false, error: "moduleTitle is required." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const result = await validateAndRecordMcqAnswerDb(sql, {
      userEmail: access.email,
      moduleId,
      moduleTitle,
      batchId: batchId || access.batchId,
      totalSlides: totalSlides ?? 1,
      questionId,
      optionId,
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

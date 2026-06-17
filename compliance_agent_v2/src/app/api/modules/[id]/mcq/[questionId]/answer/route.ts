import { getSql } from "@/lib/db";
import { invalidateAdminCachesAsync } from "@/lib/invalidate-admin-cache";
import { validateAndRecordMcqAnswerDb } from "@/lib/services/progress-db-service";
import {
  parseCorrectOptionIds,
  validateMcqSelection,
} from "@/lib/mcq-multi-select";
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

    const selectedIds: string[] = Array.isArray(optionIds)
      ? optionIds.filter((id: unknown) => typeof id === "string")
      : typeof optionId === "string"
        ? [optionId]
        : [];

    if (selectedIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "optionId or optionIds is required." },
        { status: 400 },
      );
    }

    const sql = getSql();

    if (userEmail && moduleTitle && batchId) {
      const result = await validateAndRecordMcqAnswerDb(sql, {
        userEmail,
        moduleId,
        moduleTitle,
        batchId,
        totalSlides: totalSlides ?? 1,
        questionId,
        optionIds: selectedIds,
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
        correctOptionIds: result.correctOptionIds,
        mcqCorrect: result.mcqCorrect,
        mcqTotal: result.mcqTotal,
        alreadyAnswered: result.alreadyAnswered,
      });
    }

    const rows = await sql`
      SELECT correct_option_id
      FROM mcq_questions
      WHERE id = ${questionId} AND module_id = ${moduleId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Question not found." },
        { status: 404 },
      );
    }

    const correctOptionId = String(rows[0].correct_option_id ?? "")
      .trim()
      .toLowerCase();
    const correct = validateMcqSelection(selectedIds, correctOptionId);
    const correctOptionIds = parseCorrectOptionIds(correctOptionId);

    return NextResponse.json({
      ok: true,
      correct,
      correctOptionId: correctOptionIds[0] ?? correctOptionId,
      correctOptionIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  isMultiSelectPrompt,
  normalizeCorrectOptionStorage,
  parseCorrectOptionIds,
} from "@/lib/mcq-multi-select";
import {
  importCourseQuestionBankDb,
  type CourseQuestionInput,
} from "@/lib/services/course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseQuestions(raw: unknown): CourseQuestionInput[] {
  if (!Array.isArray(raw)) {
    throw new Error("questions must be an array.");
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Question ${index + 1} is invalid.`);
    }
    const q = item as Record<string, unknown>;
    if (typeof q.prompt !== "string" || !q.prompt.trim()) {
      throw new Error(`Question ${index + 1}: prompt is required.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question ${index + 1}: at least two options required.`);
    }
    const options = q.options.map((opt, oi) => {
      if (!opt || typeof opt !== "object") {
        throw new Error(`Question ${index + 1}, option ${oi + 1} is invalid.`);
      }
      const o = opt as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.label !== "string") {
        throw new Error(`Question ${index + 1}, option ${oi + 1}: id and label required.`);
      }
      return { id: o.id, label: o.label };
    });
    if (typeof q.correctOptionId !== "string" && !Array.isArray(q.correctOptionIds)) {
      throw new Error(`Question ${index + 1}: correctOptionId or correctOptionIds is required.`);
    }
    const correctOptionIds = Array.isArray(q.correctOptionIds)
      ? q.correctOptionIds.map((id) => String(id))
      : undefined;
    const correctOptionId =
      typeof q.correctOptionId === "string" ? q.correctOptionId : undefined;
    const stored = normalizeCorrectOptionStorage(correctOptionId, correctOptionIds);
    if (!stored) {
      throw new Error(`Question ${index + 1}: at least one correct answer is required.`);
    }
    const correctSet = new Set(parseCorrectOptionIds(stored));
    for (const cid of correctSet) {
      if (!options.some((o) => o.id.trim().toLowerCase() === cid)) {
        throw new Error(`Question ${index + 1}: correct answer "${cid}" not in options.`);
      }
    }
    if (correctSet.size > 1 && !isMultiSelectPrompt(q.prompt)) {
      throw new Error(
        `Question ${index + 1}: multi-answer questions should include "[Select all that apply]" in the prompt.`,
      );
    }
    return {
      prompt: q.prompt,
      options,
      correctOptionId: stored,
      correctOptionIds: correctSet.size > 1 ? [...correctSet] : undefined,
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
    };
  });
}

/** POST — import admin-provided question bank for a course module. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id: moduleId } = await params;
    const body = await req.json();
    const questions = parseQuestions(body.questions);

    const sql = getSql();
    const result = await importCourseQuestionBankDb(sql, moduleId, questions);

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      message: `Imported ${result.imported} question(s). Course is ready for learners.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

import { getSql } from "@/lib/db";
import { PASS_THRESHOLD_PERCENT, isPassingScore } from "@/lib/constants";
import { clientCourseAssetUrl } from "@/lib/course-asset-url";
import { clientPdfUrl } from "@/lib/pdf-url";
import { resolveModuleKind } from "@/lib/module-kind";
import { dedupeMcqsByPrompt, gateCountForSlides } from "@/lib/mcq-dedupe";
import { isMultiSelectAnswer } from "@/lib/mcq-multi-select";
import { getModuleStepsDb } from "@/lib/services/course-service";
import type { CourseStepRow } from "@/lib/course-step-types";

type Sql = ReturnType<typeof getSql>;

function seededShuffle<T>(items: T[], seedText: string): T[] {
  const arr = [...items];
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hasAcceptedAcknowledgement(raw: unknown): boolean {
  if (!raw) return false;
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Boolean(value && typeof value === "object" && (value as { accepted?: boolean }).accepted);
  } catch {
    return false;
  }
}

export interface ModuleMcqRow {
  id: string;
  slideIndex: number;
  prompt: string;
  explanation?: string | null;
  correctOptionId: string;
  options: { id: string; label: string }[];
}

/** Load module + batches + MCQs (single options query) + optional progress. */
export async function loadModuleDetail(
  sql: Sql,
  moduleId: string,
  userEmail: string,
) {
  const courseRows = await sql`
    SELECT id FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  const isCourse = courseRows.length > 0;

  const [moduleRows, batchRows, mcqRows, progressRows] = await Promise.all([
    isCourse
      ? sql`SELECT * FROM course_modules WHERE id = ${moduleId} LIMIT 1`
      : sql`SELECT * FROM training_modules WHERE id = ${moduleId} LIMIT 1`,
    isCourse
      ? sql`SELECT batch_id FROM course_module_batches WHERE module_id = ${moduleId}`
      : sql`SELECT batch_id FROM module_batches WHERE module_id = ${moduleId}`,
    isCourse
      ? sql`
          SELECT q.id, q.slide_index, q.prompt, q.explanation, q.correct_option_id,
                 o.id AS option_id, o.label AS option_label
          FROM course_mcq_questions q
          LEFT JOIN course_mcq_options o ON o.question_id = q.id
          WHERE q.module_id = ${moduleId}
          ORDER BY q.slide_index, o.id
        `
      : sql`
          SELECT q.id, q.slide_index, q.prompt, q.explanation, q.correct_option_id,
                 o.id AS option_id, o.label AS option_label
          FROM mcq_questions q
          LEFT JOIN mcq_options o ON o.question_id = q.id
          WHERE q.module_id = ${moduleId}
          ORDER BY q.slide_index, o.id
        `,
    userEmail
      ? isCourse
        ? sql`
            SELECT status, retake_count, score_percent, completed_at, acknowledgement
            FROM course_progress
            WHERE user_email = ${userEmail} AND module_id = ${moduleId}
            LIMIT 1
          `
        : sql`
            SELECT status, retake_count, score_percent, completed_at, acknowledgement
            FROM assessment_progress
            WHERE user_email = ${userEmail} AND module_id = ${moduleId}
            LIMIT 1
          `
      : Promise.resolve([]),
  ]);

  if (moduleRows.length === 0) return null;

  const row = moduleRows[0];

  const mcqPool: ModuleMcqRow[] = [];
  const mcqById = new Map<string, ModuleMcqRow>();
  for (const mcqRow of mcqRows) {
    const qid = mcqRow.id as string;
    let question = mcqById.get(qid);
    if (!question) {
      question = {
        id: qid,
        slideIndex: Number(mcqRow.slide_index),
        prompt: mcqRow.prompt as string,
        explanation:
          typeof mcqRow.explanation === "string" ? mcqRow.explanation : null,
        correctOptionId: String(mcqRow.correct_option_id ?? ""),
        options: [],
      };
      mcqById.set(qid, question);
      mcqPool.push(question);
    }
    if (mcqRow.option_id) {
      question.options.push({
        id: mcqRow.option_id as string,
        label: mcqRow.option_label as string,
      });
    }
  }

  const progress = progressRows[0];
  const rawStatus = (progress?.status as string | undefined) ?? "not_started";
  const scorePercent =
    progress?.score_percent != null ? Number(progress.score_percent) : null;
  const progressStatus =
    rawStatus === "failed" && scorePercent != null ? "in_progress" : rawStatus;
  const hasAck = hasAcceptedAcknowledgement(progress?.acknowledgement);
  const isCompleted =
    progress?.completed_at != null ||
    (progressStatus === "completed" && hasAck);
  const passedPendingAck =
    isPassingScore(scorePercent) &&
    !hasAck &&
    progressStatus !== "permanently_failed";
  const retakeCount = Number(progress?.retake_count ?? 0);
  const isScoreRetake =
    !isCompleted &&
    !passedPendingAck &&
    progressStatus !== "permanently_failed" &&
    ((scorePercent != null && scorePercent < PASS_THRESHOLD_PERCENT) ||
      (retakeCount > 0 &&
        scorePercent == null &&
        (progressStatus === "in_progress" || rawStatus === "failed")));
  const viewerMode:
    | "standard"
    | "quiz_only_retake"
    | "review_only"
    | "acknowledgement_pending"
    | "already_completed" = isCompleted
    ? "already_completed"
    : passedPendingAck
      ? "acknowledgement_pending"
      : isScoreRetake
        ? "quiz_only_retake"
        : "standard";

  const slideCount = Number(row.slide_count ?? 1);
  const gateSlides: number[] = [];
  for (let slide = 3; slide <= Math.max(slideCount, 3); slide += 3) {
    gateSlides.push(slide);
  }

  const moduleKind = isCourse ? "course" : resolveModuleKind(row.module_kind, moduleId);

  const uniquePool = dedupeMcqsByPrompt(mcqPool);
  const gateTotal = gateCountForSlides(slideCount);
  const needed =
    viewerMode === "quiz_only_retake" || isCourse
      ? uniquePool.length
      : gateTotal > 0
        ? Math.min(gateTotal, uniquePool.length)
        : uniquePool.length;
  const randomized = userEmail
    ? seededShuffle(uniquePool, `${moduleId}:${userEmail}:v2`)
    : uniquePool;
  const sliceCount =
    isCourse || viewerMode === "quiz_only_retake"
      ? uniquePool.length
      : Math.max(needed, uniquePool.length > 0 ? 1 : 0);
  const selected = randomized.slice(0, sliceCount);

  const mcqs = selected.map((q, index) => ({
    id: q.id,
    slideIndex: isCourse ? 0 : (gateSlides[index] ?? q.slideIndex),
    prompt: q.prompt,
    options: q.options,
    explanation: q.explanation ?? undefined,
    allowMultiple: isMultiSelectAnswer(q.correctOptionId, q.prompt),
  }));

  let steps: CourseStepRow[] | undefined;
  if (isCourse) {
    const rawSteps = await getModuleStepsDb(sql, moduleId);
    steps = rawSteps
      .filter((s) => s.stepType !== "quiz")
      .map((s) => ({
        ...s,
        config: {
          ...s.config,
          assetUrl: clientCourseAssetUrl(s.config.assetUrl),
        },
      }));
  }

  return {
    module: {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      slideCount: row.slide_count as number,
      durationMinutes: row.duration_minutes as number,
      status: progressStatus,
      batchIds: batchRows.map((b) => b.batch_id as string),
      pdfUrl: clientPdfUrl(row.pdf_url as string),
      contentType: (row.content_type as string) ?? "text",
      moduleKind,
      createdAt: row.created_at ? new Date(row.created_at as string).getTime() : undefined,
      feedbackRequired: Boolean(row.feedback_required),
      viewerMode,
    },
    mcqs,
    steps,
  };
}

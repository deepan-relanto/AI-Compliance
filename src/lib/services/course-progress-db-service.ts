import type { getSql } from "@/lib/db";
import { PASS_THRESHOLD_PERCENT, isPassingScore, SCORE_QUIZ_RETAKE_MARKER } from "@/lib/constants";
import { consumeApprovedRetakeDb } from "@/lib/services/course-review-db-service";
import {
  computeScoreFromAnswers,
  countMcqAnswers,
  resolveDisplayScorePercent,
} from "@/lib/progress-score";
import { validateMcqSelection } from "@/lib/mcq-multi-select";

type Sql = ReturnType<typeof getSql>;

export type ProgressRow = {
  user_email: string;
  module_id: string;
  module_title: string;
  batch_id: string;
  current_slide: number;
  total_slides: number;
  status: string;
  warning_count: number;
  retake_count: number;
  mcq_correct: number;
  mcq_total: number;
  score_percent: number | null;
  mcq_answers: Record<string, boolean>;
  failed_reason: string | null;
  completed_at: string | null;
};

export type ProgressActivityContext = {
  lastAccessedAt?: string | null;
  currentSlide?: number;
  answerCount?: number;
  warningCount?: number;
};

/** True when the learner has genuinely engaged with the assessment (not just opened the URL). */
export function hasMeaningfulAttemptActivity(
  activity: ProgressActivityContext,
): boolean {
  return (
    (activity.answerCount ?? 0) > 0 ||
    (activity.warningCount ?? 0) > 0 ||
    (activity.currentSlide ?? 0) > 0
  );
}

/**
 * Display status for admin analytics and batch marks.
 * Never maps proctor `failed` to `in_progress`. Treats idle opens as `not_started`.
 */
export function normalizeProgressStatus(
  status: string | null | undefined,
  scorePercent: number | null,
  completedAt?: string | null,
  activity?: ProgressActivityContext,
): string {
  const s = status ?? "not_started";
  if (s === "permanently_failed") return "permanently_failed";
  if (s === "completed" || completedAt) return "completed";
  if (s === "failed") return "failed";

  const engaged = hasMeaningfulAttemptActivity(activity ?? {});

  if (s === "not_started" && !engaged) return "not_started";
  if (s === "in_progress" && !engaged) return "not_started";
  if (engaged || s === "in_progress") return "in_progress";
  return s;
}

/** Clear or fix scores that do not match stored MCQ answers. */
export async function reconcileInvalidProgressScores(sql: Sql): Promise<number> {
  const cleared = await sql`
    UPDATE course_progress
    SET score_percent = NULL,
        failed_reason = NULL,
        updated_at = NOW()
    WHERE score_percent IS NOT NULL
      AND status NOT IN ('completed', 'permanently_failed')
      AND (
        (
          COALESCE(mcq_correct, 0) = 0
          AND (mcq_answers IS NULL OR mcq_answers = '{}'::jsonb)
        )
        OR (
          COALESCE(mcq_correct, 0) = 0
          AND score_percent > 0
        )
      )
    RETURNING id
  `;

  const mismatched = await sql`
    SELECT id, mcq_answers, mcq_total, mcq_correct, score_percent, status
    FROM course_progress
    WHERE score_percent IS NOT NULL
      AND status NOT IN ('permanently_failed')
      AND mcq_answers IS NOT NULL
      AND mcq_answers::text <> '{}'
  `;

  let fixed = 0;
  for (const row of mismatched) {
    const answers = parseMcqAnswers(row.mcq_answers);
    const assignedTotal = Number(row.mcq_total ?? 0);
    const { mcqCorrect, mcqTotal, scorePercent } = computeScoreFromAnswers(
      answers,
      assignedTotal,
    );
    const stored = Number(row.score_percent);
    const status = row.status as string;
    const shouldStore =
      status === "completed" ||
      countMcqAnswers(answers) > 0 ||
      scorePercent === 0;

    if (!shouldStore && stored > 0) {
      await sql`
        UPDATE course_progress
        SET score_percent = NULL, failed_reason = NULL, updated_at = NOW()
        WHERE id = ${row.id as string}
      `;
      fixed++;
      continue;
    }

    if (
      mcqCorrect !== Number(row.mcq_correct ?? 0) ||
      mcqTotal !== Number(row.mcq_total ?? 0) ||
      scorePercent !== stored
    ) {
      await sql`
        UPDATE course_progress
        SET mcq_correct = ${mcqCorrect},
            mcq_total = ${mcqTotal},
            score_percent = ${shouldStore ? scorePercent : null},
            updated_at = NOW()
        WHERE id = ${row.id as string}
      `;
      fixed++;
    }
  }

  return cleared.length + fixed;
}

/** Fix rows where acknowledgement was saved but status was not marked completed. */
export async function reconcilePassedProgressStatus(sql: Sql): Promise<number> {
  const rows = await sql`
    UPDATE course_progress
    SET status = 'completed',
        completed_at = COALESCE(completed_at, last_accessed_at, updated_at, NOW()),
        last_accessed_at = COALESCE(last_accessed_at, updated_at, NOW()),
        updated_at = NOW()
    WHERE score_percent IS NOT NULL
      AND score_percent >= ${PASS_THRESHOLD_PERCENT}
      AND status IN ('not_started', 'in_progress')
      AND acknowledgement IS NOT NULL
      AND (acknowledgement->>'accepted')::boolean IS TRUE
    RETURNING id
  `;

  await sql`
    UPDATE course_progress
    SET completed_at = COALESCE(completed_at, last_accessed_at, updated_at, NOW()),
        last_accessed_at = COALESCE(last_accessed_at, updated_at, NOW())
    WHERE score_percent IS NOT NULL
      AND status = 'completed'
      AND (completed_at IS NULL OR last_accessed_at IS NULL)
  `;

  return rows.length;
}

function parseMcqAnswers(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, boolean>;
}

function mapProgressRow(r: Record<string, unknown>): ProgressRow {
  return {
    user_email: r.user_email as string,
    module_id: r.module_id as string,
    module_title: r.module_title as string,
    batch_id: r.batch_id as string,
    current_slide: Number(r.current_slide),
    total_slides: Number(r.total_slides),
    status: r.status as string,
    warning_count: Number(r.warning_count ?? 0),
    retake_count: Number(r.retake_count ?? 0),
    mcq_correct: Number(r.mcq_correct ?? 0),
    mcq_total: Number(r.mcq_total ?? 0),
    score_percent: r.score_percent != null ? Number(r.score_percent) : null,
    mcq_answers: parseMcqAnswers(r.mcq_answers),
    failed_reason: (r.failed_reason as string) ?? null,
    completed_at: (r.completed_at as string) ?? null,
  };
}

export async function getModuleMcqCount(sql: Sql, moduleId: string): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS c FROM course_mcq_questions WHERE module_id = ${moduleId}
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function getProgressRow(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<ProgressRow | null> {
  const rows = await sql`
    SELECT user_email, module_id, module_title, batch_id, current_slide, total_slides,
           status, warning_count, retake_count, mcq_correct, mcq_total, score_percent,
           mcq_answers, failed_reason, completed_at
    FROM course_progress
    WHERE user_email = ${userEmail} AND module_id = ${moduleId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return mapProgressRow(rows[0] as Record<string, unknown>);
}

/** Start or resume training — optional fresh reset + single upsert. */
export async function startTrainingSessionDb(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    batchId: string;
    totalSlides: number;
    assignedMcqCount?: number;
    freshStart?: boolean;
    currentSlide?: number;
  },
): Promise<ProgressRow> {
  const userRows = await sql`
    SELECT batch_id FROM users
    WHERE LOWER(email) = LOWER(${params.userEmail})
    LIMIT 1
  `;
  const resolvedBatchId =
    (userRows[0]?.batch_id as string | null)?.trim() || params.batchId;

  // Normalize impossible state: max retakes used but no finalized score.
  await sql`
    UPDATE course_progress
    SET status = 'failed',
        failed_reason = 'Maximum score retakes reached. Please contact your administrator.',
        last_failure_at = NOW(),
        last_failure_reason = 'Maximum score retakes reached.',
        updated_at = NOW()
    WHERE user_email = ${params.userEmail}
      AND module_id = ${params.moduleId}
      AND retake_count >= 2
      AND score_percent IS NULL
      AND status = 'in_progress'
      AND completed_at IS NULL
  `;

  if (params.freshStart) {
    const existing = await getProgressRow(sql, params.userEmail, params.moduleId);
    if (
      existing?.status === "failed" ||
      existing?.status === "permanently_failed"
    ) {
      throw new Error(
        "This attempt has failed. Submit a review request or contact your administrator.",
      );
    }

    if (
      existing &&
      (existing.status === "not_started" || existing.status === "in_progress")
    ) {
      if (Number(existing.retake_count ?? 0) > 0) {
        await consumeApprovedRetakeDb(sql, params.userEmail, params.moduleId);
      }

      await sql`
        UPDATE course_progress
        SET status = 'in_progress',
            current_slide = 0,
            mcq_answers = '{}'::jsonb,
            mcq_correct = 0,
            score_percent = NULL,
            failed_reason = NULL,
            last_failure_reason = NULL,
            completed_at = NULL,
            last_accessed_at = NOW(),
            updated_at = NOW()
        WHERE user_email = ${params.userEmail}
          AND module_id = ${params.moduleId}
          AND status IN ('not_started', 'in_progress')
      `;
    }
  }

  const mcqTotal =
    params.assignedMcqCount && params.assignedMcqCount > 0
      ? params.assignedMcqCount
      : await getModuleMcqCount(sql, params.moduleId);

  const slideValue =
    typeof params.currentSlide === "number" ? params.currentSlide : 0;

  const rows = await sql`
    INSERT INTO course_progress (
      user_email, module_id, module_title, batch_id, current_slide, total_slides,
      status, mcq_total, mcq_correct, mcq_answers
    )
    VALUES (
      ${params.userEmail},
      ${params.moduleId},
      ${params.moduleTitle},
      ${resolvedBatchId},
      ${slideValue},
      ${params.totalSlides},
      'in_progress',
      ${mcqTotal},
      0,
      ${JSON.stringify({})}::jsonb
    )
    ON CONFLICT (user_email, module_id) DO UPDATE SET
      module_title = EXCLUDED.module_title,
      batch_id = EXCLUDED.batch_id,
      total_slides = EXCLUDED.total_slides,
      mcq_total = CASE
        WHEN course_progress.mcq_total > 0 THEN course_progress.mcq_total
        ELSE EXCLUDED.mcq_total
      END,
      current_slide = CASE
        WHEN ${typeof params.currentSlide === "number"} THEN ${slideValue}
        ELSE course_progress.current_slide
      END,
      status = CASE
        WHEN course_progress.status IN ('completed', 'permanently_failed') THEN course_progress.status
        WHEN course_progress.status = 'failed' AND course_progress.score_percent IS NOT NULL THEN 'in_progress'
        WHEN course_progress.status = 'not_started' THEN 'in_progress'
        ELSE course_progress.status
      END,
      last_accessed_at = NOW(),
      updated_at = NOW()
    RETURNING user_email, module_id, module_title, batch_id, current_slide, total_slides,
              status, warning_count, retake_count, mcq_correct, mcq_total, score_percent,
              mcq_answers, failed_reason, completed_at
  `;

  return mapProgressRow(rows[0] as Record<string, unknown>);
}

/** Validate MCQ + update progress in at most two DB round-trips. */
export async function validateAndRecordMcqAnswerDb(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    batchId: string;
    totalSlides: number;
    questionId: string;
    optionId?: string;
    optionIds?: string[];
    assignedMcqCount?: number;
  },
): Promise<{
  found: boolean;
  correct: boolean;
  correctOptionId: string;
  mcqCorrect: number;
  mcqTotal: number;
  alreadyAnswered: boolean;
}> {
  const rows = await sql`
    SELECT
      q.correct_option_id,
      q.prompt,
      p.status AS progress_status,
      p.mcq_correct,
      p.mcq_total,
      p.mcq_answers,
      p.score_percent
    FROM course_mcq_questions q
    LEFT JOIN course_progress p
      ON p.user_email = ${params.userEmail} AND p.module_id = ${params.moduleId}
    WHERE q.id = ${params.questionId} AND q.module_id = ${params.moduleId}
    LIMIT 1
  `;

  if (rows.length === 0 || !rows[0].correct_option_id) {
    return {
      found: false,
      correct: false,
      correctOptionId: "",
      mcqCorrect: 0,
      mcqTotal: 0,
      alreadyAnswered: false,
    };
  }

  const correctOptionId = String(rows[0].correct_option_id ?? "")
    .trim()
    .toLowerCase();
  const picked =
    params.optionIds && params.optionIds.length > 0
      ? params.optionIds
      : params.optionId
        ? [params.optionId]
        : [];
  const correct = validateMcqSelection(picked, correctOptionId);
  let progressStatus = rows[0].progress_status as string | null;

  if (!progressStatus) {
    await startTrainingSessionDb(sql, {
      userEmail: params.userEmail,
      moduleId: params.moduleId,
      moduleTitle: params.moduleTitle,
      batchId: params.batchId,
      totalSlides: params.totalSlides,
      assignedMcqCount: params.assignedMcqCount,
    });
    progressStatus = "in_progress";
    rows[0].mcq_correct = 0;
    rows[0].mcq_total =
      params.assignedMcqCount && params.assignedMcqCount > 0
        ? params.assignedMcqCount
        : 0;
    rows[0].mcq_answers = {};
    rows[0].score_percent = null;
  }

  const mcqAnswers = parseMcqAnswers(rows[0].mcq_answers);
  const mcqCorrectStored = Number(rows[0].mcq_correct ?? 0);
  const mcqTotalStored = Number(rows[0].mcq_total ?? 0);

  if (
    progressStatus === "completed" ||
    progressStatus === "permanently_failed" ||
    (progressStatus === "failed" && rows[0].score_percent == null)
  ) {
    return {
      found: true,
      correct,
      correctOptionId,
      mcqCorrect: mcqCorrectStored,
      mcqTotal: mcqTotalStored,
      alreadyAnswered: false,
    };
  }

  if (Object.prototype.hasOwnProperty.call(mcqAnswers, params.questionId)) {
    return {
      found: true,
      correct,
      correctOptionId,
      mcqCorrect: mcqCorrectStored,
      mcqTotal: mcqTotalStored,
      alreadyAnswered: true,
    };
  }

  const answers = { ...mcqAnswers, [params.questionId]: correct };
  const assignedTotal =
    mcqTotalStored > 0
      ? mcqTotalStored
      : params.assignedMcqCount && params.assignedMcqCount > 0
        ? params.assignedMcqCount
        : await getModuleMcqCount(sql, params.moduleId);
  const { mcqCorrect, mcqTotal } = computeScoreFromAnswers(answers, assignedTotal);

  // Fire and forget the update to eliminate DB write latency from the user's critical path
  sql`
    UPDATE course_progress
    SET mcq_answers = ${JSON.stringify(answers)}::jsonb,
        mcq_correct = ${mcqCorrect},
        mcq_total = ${mcqTotal},
        status = CASE
          WHEN status IN ('not_started', 'failed') THEN 'in_progress'
          ELSE status
        END,
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
  `.catch(console.error);

  return {
    found: true,
    correct,
    correctOptionId,
    mcqCorrect,
    mcqTotal,
    alreadyAnswered: false,
  };
}

export async function ensureProgressRow(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    batchId: string;
    totalSlides: number;
    assignedMcqCount?: number;
  },
): Promise<ProgressRow> {
  const existing = await getProgressRow(sql, params.userEmail, params.moduleId);
  if (existing) {
    if (existing.status === "failed" && existing.score_percent != null) {
      await sql`
        UPDATE course_progress
        SET status = 'in_progress', updated_at = NOW()
        WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
      `;
      const migrated = await getProgressRow(sql, params.userEmail, params.moduleId);
      if (migrated) return migrated;
    }
    if (
      params.assignedMcqCount &&
      params.assignedMcqCount > 0 &&
      !["completed", "failed", "permanently_failed"].includes(existing.status) &&
      Object.keys(existing.mcq_answers).length === 0 &&
      existing.mcq_total !== params.assignedMcqCount
    ) {
      await sql`
        UPDATE course_progress
        SET mcq_total = ${params.assignedMcqCount}, updated_at = NOW()
        WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
      `;
      const updated = await getProgressRow(sql, params.userEmail, params.moduleId);
      if (updated) return updated;
    }
    return existing;
  }

  const mcqTotal =
    params.assignedMcqCount && params.assignedMcqCount > 0
      ? params.assignedMcqCount
      : await getModuleMcqCount(sql, params.moduleId);

  await sql`
    INSERT INTO course_progress (
      user_email, module_id, module_title, batch_id, current_slide, total_slides,
      status, mcq_total, mcq_correct, mcq_answers
    )
    VALUES (
      ${params.userEmail},
      ${params.moduleId},
      ${params.moduleTitle},
      ${params.batchId},
      0,
      ${params.totalSlides},
      'in_progress',
      ${mcqTotal},
      0,
      ${JSON.stringify({})}::jsonb
    )
    ON CONFLICT (user_email, module_id) DO NOTHING
  `;

  const row = await getProgressRow(sql, params.userEmail, params.moduleId);
  if (!row) {
    throw new Error("Could not create progress record.");
  }
  return row;
}

export async function saveSlideProgressDb(
  sql: Sql,
  userEmail: string,
  moduleId: string,
  currentSlide: number,
): Promise<void> {
  await sql`
    UPDATE course_progress
    SET current_slide = ${currentSlide}, last_accessed_at = NOW(), updated_at = NOW()
    WHERE user_email = ${userEmail} AND module_id = ${moduleId}
      AND status IN ('not_started', 'in_progress')
  `;
}

export async function recordMcqAnswerDb(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    batchId: string;
    totalSlides: number;
    questionId: string;
    wasCorrect: boolean;
  },
): Promise<{ mcqCorrect: number; mcqTotal: number; alreadyAnswered?: boolean }> {
  await ensureProgressRow(sql, {
    userEmail: params.userEmail,
    moduleId: params.moduleId,
    moduleTitle: params.moduleTitle,
    batchId: params.batchId,
    totalSlides: params.totalSlides,
  });

  const row = await getProgressRow(sql, params.userEmail, params.moduleId);
  if (!row) throw new Error("Progress not found.");

  if (row.status === "completed" || row.status === "permanently_failed") {
    return { mcqCorrect: row.mcq_correct, mcqTotal: row.mcq_total };
  }
  if (row.status === "failed" && row.score_percent == null) {
    return { mcqCorrect: row.mcq_correct, mcqTotal: row.mcq_total };
  }

  if (Object.prototype.hasOwnProperty.call(row.mcq_answers, params.questionId)) {
    return {
      mcqCorrect: row.mcq_correct,
      mcqTotal: row.mcq_total,
      alreadyAnswered: true,
    };
  }

  const answers = { ...row.mcq_answers, [params.questionId]: params.wasCorrect };
  const assignedTotal =
    row.mcq_total > 0 ? row.mcq_total : await getModuleMcqCount(sql, params.moduleId);
  const { mcqCorrect, mcqTotal } = computeScoreFromAnswers(answers, assignedTotal);

  await sql`
    UPDATE course_progress
    SET mcq_answers = ${JSON.stringify(answers)}::jsonb,
        mcq_correct = ${mcqCorrect},
        mcq_total = ${mcqTotal},
        status = CASE
          WHEN status IN ('not_started', 'failed') THEN 'in_progress'
          ELSE status
        END,
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
  `;

  return { mcqCorrect, mcqTotal };
}

export async function finalizeAssessmentDb(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<{
  scorePercent: number;
  passed: boolean;
  canRetake: boolean;
  mcqCorrect: number;
  mcqTotal: number;
}> {
  const row = await getProgressRow(sql, userEmail, moduleId);
  if (!row) {
    return { scorePercent: 0, passed: false, canRetake: true, mcqCorrect: 0, mcqTotal: 0 };
  }

  const answerCount = countMcqAnswers(row.mcq_answers);
  const { mcqCorrect, mcqTotal, scorePercent } = computeScoreFromAnswers(
    row.mcq_answers,
    row.mcq_total,
  );
  const passed = isPassingScore(scorePercent) && answerCount > 0;
  const retakeCount = Number(row.retake_count ?? 0);
  const canRetake = !passed && retakeCount < 2;

  // Pass/fail score is saved here; status stays in_progress until acknowledgement (and feedback if required).
  const status = "in_progress";
  const failedReason = passed
    ? null
    : answerCount > 0
      ? `Score ${scorePercent}% is below the passing threshold (${PASS_THRESHOLD_PERCENT}%).`
      : null;
  const persistScorePercent = answerCount > 0 ? scorePercent : null;

  if (passed) {
    await sql`
      UPDATE course_progress
      SET status = ${status},
          score_percent = ${persistScorePercent},
          mcq_correct = ${mcqCorrect},
          mcq_total = ${mcqTotal},
          failed_reason = NULL,
          last_failure_reason = NULL,
          completed_at = NULL,
          last_accessed_at = NOW(),
          updated_at = NOW()
      WHERE user_email = ${userEmail} AND module_id = ${moduleId}
    `;
  } else {
    await sql`
      UPDATE course_progress
      SET status = ${status},
          score_percent = ${persistScorePercent},
          mcq_correct = ${mcqCorrect},
          mcq_total = ${mcqTotal},
          failed_reason = ${failedReason},
          last_failure_at = NOW(),
          last_failure_reason = ${failedReason},
          completed_at = NULL,
          last_accessed_at = NOW(),
          updated_at = NOW()
      WHERE user_email = ${userEmail} AND module_id = ${moduleId}
    `;
  }

  return { scorePercent, passed, canRetake, mcqCorrect, mcqTotal };
}

/** Persist training acknowledgement attestation for admin monitoring. */
export async function saveAcknowledgementDb(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    feedbackRequired: boolean;
    signatureName: string;
    digitalSignature: string;
  },
): Promise<void> {
  const ack = {
    userId: params.userEmail,
    userName: params.signatureName,
    signerEmail: params.userEmail,
    assessmentId: params.moduleId,
    assessmentName: params.moduleTitle,
    accepted: true,
    timestamp: Date.now(),
    digitalSignature: params.digitalSignature,
  };

  const ackJson = JSON.stringify(ack);

  if (!params.feedbackRequired) {
    await sql`
      UPDATE course_progress
      SET acknowledgement = ${ackJson}::jsonb,
          status = 'completed',
          completed_at = COALESCE(completed_at, NOW()),
          last_accessed_at = NOW(),
          updated_at = NOW()
      WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
    `;
  } else {
    await sql`
      UPDATE course_progress
      SET acknowledgement = ${ackJson}::jsonb,
          last_accessed_at = NOW(),
          updated_at = NOW()
      WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
    `;
  }
}

/** Mark assessment completed after required feedback is submitted (passing score only). */
export async function markAssessmentCompletedDb(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE course_progress
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${userEmail}
      AND module_id = ${moduleId}
      AND acknowledgement IS NOT NULL
      AND score_percent IS NOT NULL
      AND score_percent >= ${PASS_THRESHOLD_PERCENT}
    RETURNING 1
  `;
  return rows.length > 0;
}

/** Clear slide + quiz answers so learner must start fresh (no resume). */
export async function resetInProgressAttemptDb(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<void> {
  await sql`
    UPDATE course_progress
    SET status = 'in_progress',
        current_slide = 0,
        mcq_answers = ${JSON.stringify({})}::jsonb,
        mcq_correct = 0,
        score_percent = NULL,
        failed_reason = NULL,
        completed_at = NULL,
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${userEmail}
      AND module_id = ${moduleId}
      AND status = 'in_progress'
  `;
}

export async function startScoreRetakeDb(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; message?: string }> {
  const row = await getProgressRow(sql, userEmail, moduleId);
  if (!row) {
    return { ok: false, message: "No progress found for this assessment." };
  }

  const canRetake =
    row.score_percent != null && row.score_percent < PASS_THRESHOLD_PERCENT;

  if (!canRetake && row.status === "completed") {
    return { ok: false, message: "You passed this assessment and cannot retake it." };
  }

  if (row.status === "permanently_failed") {
    return { ok: false, message: "Maximum retakes reached." };
  }

  if (Number(row.retake_count ?? 0) >= 2) {
    return {
      ok: false,
      message: "Maximum score retakes reached. Please contact your administrator.",
    };
  }

  await sql`
    UPDATE course_progress
    SET status = 'in_progress',
        current_slide = 0,
        mcq_answers = ${JSON.stringify({})}::jsonb,
        mcq_correct = 0,
        mcq_total = 0,
        score_percent = NULL,
        failed_reason = NULL,
        completed_at = NULL,
        acknowledgement = NULL,
        retake_count = retake_count + 1,
        last_failure_reason = ${SCORE_QUIZ_RETAKE_MARKER},
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${userEmail} AND module_id = ${moduleId}
  `;

  return { ok: true };
}

/** Wipe learner attempt data when an assignment is (re)published to batches. */
export async function resetLearnerDataForModuleAssignment(
  sql: Sql,
  moduleId: string,
  batchIds: string[],
): Promise<{ progress: number; reviews: number; feedback: number }> {
  if (batchIds.length === 0) {
    return { progress: 0, reviews: 0, feedback: 0 };
  }

  const progress = await sql`
    DELETE FROM course_progress
    WHERE module_id = ${moduleId}
      AND user_email IN (
        SELECT email FROM users WHERE batch_id = ANY(${batchIds})
      )
    RETURNING id
  `;

  const reviews = await sql`
    DELETE FROM course_review_requests
    WHERE module_id = ${moduleId}
      AND username IN (
        SELECT email FROM users WHERE batch_id = ANY(${batchIds})
      )
    RETURNING id
  `;

  const feedback = await sql`
    DELETE FROM course_feedback_entries
    WHERE assessment_id = ${moduleId}
      AND user_id IN (
        SELECT email FROM users WHERE batch_id = ANY(${batchIds})
      )
    RETURNING id
  `;

  return {
    progress: progress.length,
    reviews: reviews.length,
    feedback: feedback.length,
  };
}

export async function listProgressForUser(sql: Sql, userEmail: string) {
  const rows = await sql`
    SELECT user_email, module_id, module_title, batch_id, current_slide, total_slides,
           status, warning_count, retake_count, mcq_correct, mcq_total, score_percent,
           mcq_answers, failed_reason, completed_at, last_accessed_at
    FROM course_progress
    WHERE user_email = ${userEmail}
    ORDER BY last_accessed_at DESC
  `;
  return rows.map((r) => {
    const mcqCorrect = Number(r.mcq_correct ?? 0);
    const mcqTotal = Number(r.mcq_total ?? 0);
    const storedScorePercent =
      r.score_percent != null ? Number(r.score_percent) : null;
    const answers = parseMcqAnswers(r.mcq_answers);
    const displayStatus = normalizeProgressStatus(
      r.status as string,
      storedScorePercent,
      (r.completed_at as string) ?? null,
      {
        lastAccessedAt: (r.last_accessed_at as string) ?? null,
        currentSlide: Number(r.current_slide ?? 0),
        answerCount: countMcqAnswers(answers),
        warningCount: Number(r.warning_count ?? 0),
      },
    );
    return {
      userEmail: r.user_email as string,
      moduleId: r.module_id as string,
      moduleTitle: r.module_title as string,
      batchId: r.batch_id as string,
      currentSlide: Number(r.current_slide),
      totalSlides: Number(r.total_slides),
      status: displayStatus,
      warningCount: Number(r.warning_count),
      retakeCount: Number(r.retake_count),
      mcqCorrect,
      mcqTotal,
      scorePercent: resolveDisplayScorePercent({
        status: displayStatus,
        storedScorePercent,
        mcqCorrect,
        mcqTotal,
        answerCount: countMcqAnswers(answers),
      }),
      failedReason: (r.failed_reason as string) ?? null,
      completedAt: (r.completed_at as string) ?? null,
    };
  });
}

/** Mark an active attempt as failed when the learner abandons the session. */
export async function failAssessmentAbandonmentDb(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    reason?: string;
  },
): Promise<{ ok: boolean; status: string }> {
  const reason = params.reason ?? "Assessment abandoned";
  const rows = await sql`
    SELECT retake_count, status
    FROM course_progress
    WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
    LIMIT 1
  `;
  if (rows.length === 0) return { ok: false, status: "not_started" };

  const existingStatus = rows[0].status as string;
  if (
    existingStatus === "completed" ||
    existingStatus === "permanently_failed" ||
    existingStatus === "failed"
  ) {
    return { ok: true, status: existingStatus };
  }

  const retakeCount = Number(rows[0].retake_count ?? 0);
  const isPermanent = retakeCount >= 2;
  const newStatus = isPermanent ? "permanently_failed" : "failed";
  const finalReason = isPermanent ? "Maximum retake limit reached" : reason;

  await sql`
    UPDATE course_progress
    SET status = ${newStatus},
        failed_reason = ${finalReason},
        last_failure_at = NOW(),
        last_failure_reason = ${finalReason},
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
  `;

  return { ok: true, status: newStatus };
}

/** Persist proctor warning state from the client session to Neon. */
export async function syncProctorWarningDb(
  sql: Sql,
  params: {
    userEmail: string;
    moduleId: string;
    warningCount: number;
    warningHistory: { reason: string; timestamp: number }[];
    status: string;
    failedReason?: string | null;
  },
): Promise<void> {
  await sql`
    UPDATE course_progress
    SET warning_count = ${params.warningCount},
        warning_history = ${JSON.stringify(params.warningHistory)}::jsonb,
        status = ${params.status},
        failed_reason = ${params.failedReason ?? null},
        last_failure_at = CASE
          WHEN ${params.status} IN ('failed', 'permanently_failed') THEN NOW()
          ELSE last_failure_at
        END,
        last_failure_reason = CASE
          WHEN ${params.status} IN ('failed', 'permanently_failed')
            THEN ${params.failedReason ?? null}
          ELSE last_failure_reason
        END,
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${params.userEmail} AND module_id = ${params.moduleId}
  `;
}

export async function listProgressForBatch(sql: Sql, batchId: string) {
  const rows = await sql`
    SELECT user_email, module_id, module_title, batch_id, current_slide, total_slides,
           status, warning_count, retake_count, mcq_correct, mcq_total, score_percent,
           failed_reason, completed_at
    FROM course_progress
    WHERE batch_id = ${batchId}
    ORDER BY module_title, user_email
  `;
  return rows.map((r) => ({
    userEmail: r.user_email as string,
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    batchId: r.batch_id as string,
    status: r.status as string,
    retakeCount: Number(r.retake_count),
    mcqCorrect: Number(r.mcq_correct ?? 0),
    mcqTotal: Number(r.mcq_total ?? 0),
    scorePercent: r.score_percent != null ? Number(r.score_percent) : null,
    failedReason: (r.failed_reason as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
  }));
}

export async function listAllProgressAdmin(sql: Sql) {
  const rows = await sql`
    SELECT user_email, module_id, module_title, batch_id, status, retake_count,
           mcq_correct, mcq_total, score_percent, mcq_answers, failed_reason, completed_at,
           current_slide, warning_count, last_accessed_at
    FROM course_progress
    WHERE score_percent IS NOT NULL OR status IN ('completed', 'failed')
    ORDER BY completed_at DESC NULLS LAST, module_title
  `;
  return rows.map((r) => {
    const mcqCorrect = Number(r.mcq_correct ?? 0);
    const mcqTotal = Number(r.mcq_total ?? 0);
    const storedScorePercent =
      r.score_percent != null ? Number(r.score_percent) : null;
    const answers = parseMcqAnswers(r.mcq_answers);
    const displayStatus = normalizeProgressStatus(
      r.status as string,
      storedScorePercent,
      (r.completed_at as string) ?? null,
      {
        lastAccessedAt: (r.last_accessed_at as string) ?? null,
        currentSlide: Number(r.current_slide ?? 0),
        answerCount: countMcqAnswers(answers),
        warningCount: Number(r.warning_count ?? 0),
      },
    );
    return {
      userEmail: r.user_email as string,
      moduleId: r.module_id as string,
      moduleTitle: r.module_title as string,
      batchId: r.batch_id as string,
      status: displayStatus,
      retakeCount: Number(r.retake_count),
      mcqCorrect,
      mcqTotal,
      scorePercent: resolveDisplayScorePercent({
        status: displayStatus,
        storedScorePercent,
        mcqCorrect,
        mcqTotal,
        answerCount: countMcqAnswers(parseMcqAnswers(r.mcq_answers)),
      }),
      failedReason: (r.failed_reason as string) ?? null,
      completedAt: (r.completed_at as string) ?? null,
    };
  });
}


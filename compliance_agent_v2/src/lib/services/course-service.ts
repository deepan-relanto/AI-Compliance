import type { getSql } from "@/lib/db";
import {
  COURSE_STEP_LABELS,
  COURSE_STEP_ORDER,
  type CourseLibraryItem,
  type CourseStepConfig,
  type CourseStepRow,
  type CourseStepType,
} from "@/lib/course-step-types";
import {
  normalizeCorrectOptionStorage,
  parseCorrectOptionIds,
} from "@/lib/mcq-multi-select";
import { copyMcqsFromModule } from "@/lib/services/mcq-copy-service";

type Sql = ReturnType<typeof getSql>;

export type CourseQuestionInput = {
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId?: string;
  correctOptionIds?: string[];
  explanation?: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function stepOrderFor(type: CourseStepType): number {
  return COURSE_STEP_ORDER.indexOf(type) + 1;
}

function parseConfig(raw: unknown): CourseStepConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as CourseStepConfig;
}

export async function createCourseModuleDb(
  sql: Sql,
  params: {
    title: string;
    description: string;
    durationMinutes?: number;
    batchIds?: string[];
    feedbackRequired?: boolean;
  },
): Promise<{ id: string }> {
  const id = `course-${slugify(params.title)}-${Date.now()}`;

  await sql`
    INSERT INTO training_modules (
      id, title, description, slide_count, duration_minutes,
      content_type, feedback_required, module_kind, mcq_generation_status
    )
    VALUES (
      ${id},
      ${params.title},
      ${params.description ?? ""},
      1,
      ${params.durationMinutes ?? 30},
      'text',
      ${Boolean(params.feedbackRequired)},
      'course',
      'pending'
    )
  `;

  if (params.batchIds?.length) {
    const batchIds = params.batchIds.includes("all")
      ? (await sql`SELECT id FROM batches`).map((r) => r.id as string)
      : params.batchIds;
    for (const batchId of batchIds) {
      await sql`
        INSERT INTO module_batches (module_id, batch_id)
        VALUES (${id}, ${batchId})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  return { id };
}

export async function upsertModuleStepDb(
  sql: Sql,
  moduleId: string,
  stepType: CourseStepType,
  config: CourseStepConfig,
): Promise<void> {
  const rows = await sql`
    SELECT module_kind FROM training_modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (rows.length === 0) throw new Error("Course module not found.");
  if (rows[0].module_kind !== "course") {
    throw new Error("Steps can only be added to course modules.");
  }

  const order = stepOrderFor(stepType);
  const title = COURSE_STEP_LABELS[stepType];
  const configJson = JSON.stringify(config);

  await sql`
    INSERT INTO module_steps (module_id, step_order, step_type, title, config)
    VALUES (${moduleId}, ${order}, ${stepType}, ${title}, ${configJson}::jsonb)
    ON CONFLICT (module_id, step_type) DO UPDATE SET
      step_order = EXCLUDED.step_order,
      title = EXCLUDED.title,
      config = EXCLUDED.config,
      updated_at = NOW()
  `;

  if (stepType === "pdf") {
    const isHtml =
      (config.mimeType ?? "").toLowerCase().includes("html") ||
      (config.assetUrl ?? "").toLowerCase().endsWith(".html") ||
      (config.originalName ?? "").toLowerCase().endsWith(".html") ||
      (config.originalName ?? "").toLowerCase().endsWith(".htm");

    if (isHtml) {
      await sql`
        UPDATE training_modules
        SET slide_count = 1,
            content_type = 'text',
            pdf_url = NULL,
            updated_at = NOW()
        WHERE id = ${moduleId}
      `;
    } else if (config.pageCount) {
      await sql`
        UPDATE training_modules
        SET slide_count = ${config.pageCount},
            content_type = 'pdf',
            pdf_url = ${config.assetUrl ?? null},
            updated_at = NOW()
        WHERE id = ${moduleId}
      `;
    }
  }
}

export async function getModuleStepsDb(
  sql: Sql,
  moduleId: string,
): Promise<CourseStepRow[]> {
  const rows = await sql`
    SELECT step_type, step_order, title, config
    FROM module_steps
    WHERE module_id = ${moduleId}
    ORDER BY step_order
  `;
  return rows.map((r) => ({
    stepType: r.step_type as CourseStepType,
    stepOrder: Number(r.step_order),
    title: r.title as string,
    config: parseConfig(r.config),
  }));
}

/** Load steps for many modules in one query (avoids N+1 on course library). */
export async function getModuleStepsMapDb(
  sql: Sql,
  moduleIds: string[],
): Promise<Map<string, CourseStepRow[]>> {
  const map = new Map<string, CourseStepRow[]>();
  if (moduleIds.length === 0) return map;

  const rows = await sql`
    SELECT module_id, step_type, step_order, title, config
    FROM module_steps
    WHERE module_id = ANY(${moduleIds})
    ORDER BY module_id, step_order
  `;

  for (const r of rows) {
    const moduleId = r.module_id as string;
    const step: CourseStepRow = {
      stepType: r.step_type as CourseStepType,
      stepOrder: Number(r.step_order),
      title: r.title as string,
      config: parseConfig(r.config),
    };
    const list = map.get(moduleId);
    if (list) list.push(step);
    else map.set(moduleId, [step]);
  }
  return map;
}

export async function importCourseQuestionBankDb(
  sql: Sql,
  moduleId: string,
  questions: CourseQuestionInput[],
): Promise<{ imported: number }> {
  const rows = await sql`
    SELECT id, module_kind FROM training_modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (rows.length === 0) throw new Error("Course module not found.");
  if (rows[0].module_kind !== "course") {
    throw new Error("Question bank import is only for course modules.");
  }
  if (questions.length === 0) {
    throw new Error("At least one question is required.");
  }

  await sql`DELETE FROM mcq_options WHERE question_id IN (
    SELECT id FROM mcq_questions WHERE module_id = ${moduleId}
  )`;
  await sql`DELETE FROM mcq_questions WHERE module_id = ${moduleId}`;

  let imported = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const optionIds = new Set(q.options.map((o) => o.id.trim().toLowerCase()));
    const correctStored = normalizeCorrectOptionStorage(
      q.correctOptionId,
      q.correctOptionIds,
    );
    if (!correctStored) {
      throw new Error(
        `Question ${i + 1}: correctOptionId or correctOptionIds is required.`,
      );
    }
    const correctIds = parseCorrectOptionIds(correctStored);
    for (const correctId of correctIds) {
      if (!optionIds.has(correctId)) {
        throw new Error(`Question ${i + 1}: correct answer "${correctId}" not found in options.`);
      }
    }
    if (q.options.length < 2) {
      throw new Error(`Question ${i + 1}: at least two options required.`);
    }

    const qId = `${moduleId}-q-${i + 1}`;
    const slideIndex = 0;

    await sql`
      INSERT INTO mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation)
      VALUES (
        ${qId},
        ${moduleId},
        ${slideIndex},
        ${q.prompt.trim()},
        ${correctStored},
        ${q.explanation?.trim() ?? null}
      )
    `;

    for (const opt of q.options) {
      await sql`
        INSERT INTO mcq_options (id, question_id, label)
        VALUES (${opt.id.trim().toLowerCase()}, ${qId}, ${opt.label.trim()})
      `;
    }
    imported++;
  }

  await upsertModuleStepDb(sql, moduleId, "quiz", { questionCount: imported });

  return { imported };
}

export function isCourseBundleComplete(
  steps: CourseStepRow[],
  questionCount: number,
): boolean {
  const types = new Set(steps.map((s) => s.stepType));
  for (const t of COURSE_STEP_ORDER) {
    if (t === "quiz") {
      if (questionCount < 1) return false;
      continue;
    }
    if (!types.has(t)) return false;
    const step = steps.find((s) => s.stepType === t);
    if (!step?.config.assetUrl) return false;
  }
  return true;
}

export async function publishCourseModuleDb(
  sql: Sql,
  moduleId: string,
  batchIds: string[],
): Promise<void> {
  const steps = await getModuleStepsDb(sql, moduleId);
  const countRows = await sql`
    SELECT COUNT(*)::int AS c FROM mcq_questions WHERE module_id = ${moduleId}
  `;
  const questionCount = Number(countRows[0]?.c ?? 0);

  if (!isCourseBundleComplete(steps, questionCount)) {
    throw new Error(
      "Complete all bundle steps (HTML lesson, video, HTML mind map, infographic, quiz) before publishing.",
    );
  }

  if (!batchIds.length) {
    throw new Error("Select at least one batch.");
  }

  const ids = batchIds.includes("all")
    ? (await sql`SELECT id FROM batches`).map((r) => r.id as string)
    : batchIds;

  await sql`DELETE FROM module_batches WHERE module_id = ${moduleId}`;
  for (const batchId of ids) {
    await sql`
      INSERT INTO module_batches (module_id, batch_id)
      VALUES (${moduleId}, ${batchId})
      ON CONFLICT DO NOTHING
    `;
  }

  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'completed', updated_at = NOW()
    WHERE id = ${moduleId}
  `;
}

export async function listCourseLibraryDb(sql: Sql): Promise<CourseLibraryItem[]> {
  const modules = await sql`
    SELECT
      tm.id,
      tm.title,
      tm.description,
      tm.duration_minutes,
      tm.mcq_generation_status,
      tm.created_at,
      (SELECT COUNT(*)::int FROM mcq_questions mq WHERE mq.module_id = tm.id) AS mcq_count,
      (SELECT COUNT(*)::int FROM module_steps ms WHERE ms.module_id = tm.id) AS step_count
    FROM training_modules tm
    WHERE tm.module_kind = 'course'
    ORDER BY tm.created_at DESC
  `;

  const batchRows = await sql`
    SELECT mb.module_id, b.id AS batch_id, b.label
    FROM module_batches mb
    JOIN batches b ON b.id = mb.batch_id
    JOIN training_modules tm ON tm.id = mb.module_id AND tm.module_kind = 'course'
  `;
  const batchesByModule: Record<string, { id: string; label: string }[]> = {};
  for (const row of batchRows) {
    const mid = row.module_id as string;
    if (!batchesByModule[mid]) batchesByModule[mid] = [];
    batchesByModule[mid].push({
      id: row.batch_id as string,
      label: row.label as string,
    });
  }

  const moduleIds = modules.map((m) => m.id as string);
  const stepsByModule = await getModuleStepsMapDb(sql, moduleIds);

  const result: CourseLibraryItem[] = [];
  for (const m of modules) {
    const steps = stepsByModule.get(m.id as string) ?? [];
    const mcqCount = Number(m.mcq_count ?? 0);
    const complete = isCourseBundleComplete(steps, mcqCount);
    result.push({
      id: m.id as string,
      title: m.title as string,
      description: m.description as string,
      durationMinutes: Number(m.duration_minutes ?? 30),
      mcqCount,
      stepCount: Number(m.step_count ?? 0),
      batches: batchesByModule[m.id as string] ?? [],
      canReuse: complete && m.mcq_generation_status === "completed",
      createdAt: m.created_at as string,
    });
  }
  return result;
}

export async function reuseCourseModuleDb(
  sql: Sql,
  params: {
    sourceModuleId: string;
    title: string;
    description?: string;
    batchIds: string[];
  },
): Promise<{ id: string; mcqCount: number }> {
  const sourceSteps = await getModuleStepsDb(sql, params.sourceModuleId);
  const countRows = await sql`
    SELECT COUNT(*)::int AS c FROM mcq_questions WHERE module_id = ${params.sourceModuleId}
  `;
  const questionCount = Number(countRows[0]?.c ?? 0);
  if (!isCourseBundleComplete(sourceSteps, questionCount)) {
    throw new Error("Source course bundle is incomplete and cannot be reused.");
  }

  const source = await sql`
    SELECT description, duration_minutes FROM training_modules
    WHERE id = ${params.sourceModuleId} AND module_kind = 'course'
    LIMIT 1
  `;
  if (source.length === 0) throw new Error("Source course not found.");

  const { id } = await createCourseModuleDb(sql, {
    title: params.title,
    description: params.description ?? (source[0].description as string),
    durationMinutes: Number(source[0].duration_minutes ?? 30),
    batchIds: params.batchIds,
  });

  for (const step of sourceSteps) {
    if (step.stepType === "quiz") {
      await upsertModuleStepDb(sql, id, "quiz", { questionCount });
      continue;
    }
    await upsertModuleStepDb(sql, id, step.stepType, step.config);
  }

  const mcqCount = await copyMcqsFromModule(sql, params.sourceModuleId, id);

  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'completed', updated_at = NOW()
    WHERE id = ${id}
  `;

  return { id, mcqCount };
}

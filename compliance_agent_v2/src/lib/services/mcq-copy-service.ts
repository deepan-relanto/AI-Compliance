import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

/** Copy all MCQs from source module to a new module (reuse pipeline). */
export async function copyMcqsFromModule(
  sql: Sql,
  sourceModuleId: string,
  targetModuleId: string,
): Promise<number> {
  const questions = await sql`
    SELECT id, slide_index, prompt, correct_option_id, explanation
    FROM mcq_questions WHERE module_id = ${sourceModuleId}
    ORDER BY slide_index
  `;

  if (questions.length === 0) return 0;

  await sql`DELETE FROM mcq_options WHERE question_id IN (
    SELECT id FROM mcq_questions WHERE module_id = ${targetModuleId}
  )`;
  await sql`DELETE FROM mcq_questions WHERE module_id = ${targetModuleId}`;

  let copied = 0;
  for (const q of questions) {
    const oldQid = q.id as string;
    const slideIndex = Number(q.slide_index);
    const newQid = `${targetModuleId}-gate-${slideIndex}`;

    await sql`
      INSERT INTO mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation)
      VALUES (${newQid}, ${targetModuleId}, ${slideIndex}, ${q.prompt}, ${q.correct_option_id}, ${q.explanation})
    `;

    const options = await sql`
      SELECT id, label FROM mcq_options WHERE question_id = ${oldQid}
    `;
    for (const opt of options) {
      await sql`
        INSERT INTO mcq_options (id, question_id, label)
        VALUES (${opt.id as string}, ${newQid}, ${opt.label as string})
      `;
    }
    copied++;
  }

  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'completed', updated_at = NOW()
    WHERE id = ${targetModuleId}
  `;

  return copied;
}

/** Copy all MCQs between course modules (course_* tables). */
export async function copyCourseMcqsFromModule(
  sql: Sql,
  sourceModuleId: string,
  targetModuleId: string,
): Promise<number> {
  const questions = await sql`
    SELECT id, slide_index, prompt, correct_option_id, explanation
    FROM course_mcq_questions WHERE module_id = ${sourceModuleId}
    ORDER BY slide_index
  `;

  if (questions.length === 0) return 0;

  await sql`DELETE FROM course_mcq_options WHERE question_id IN (
    SELECT id FROM course_mcq_questions WHERE module_id = ${targetModuleId}
  )`;
  await sql`DELETE FROM course_mcq_questions WHERE module_id = ${targetModuleId}`;

  let copied = 0;
  for (const q of questions) {
    const oldQid = q.id as string;
    const slideIndex = Number(q.slide_index);
    const newQid = `${targetModuleId}-gate-${slideIndex}`;

    await sql`
      INSERT INTO course_mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation)
      VALUES (${newQid}, ${targetModuleId}, ${slideIndex}, ${q.prompt}, ${q.correct_option_id}, ${q.explanation})
    `;

    const options = await sql`
      SELECT id, label FROM course_mcq_options WHERE question_id = ${oldQid}
    `;
    for (const opt of options) {
      await sql`
        INSERT INTO course_mcq_options (id, question_id, label)
        VALUES (${opt.id as string}, ${newQid}, ${opt.label as string})
      `;
    }
    copied++;
  }

  await sql`
    UPDATE course_modules
    SET mcq_generation_status = 'completed', updated_at = NOW()
    WHERE id = ${targetModuleId}
  `;

  return copied;
}

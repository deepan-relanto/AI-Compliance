/**
 * Clone a live course bundle into isolated tts_* sandbox tables.
 *
 * Safe by design:
 * - source stays untouched
 * - learner/admin activity tables stay untouched
 * - no batch assignment is copied
 * - uploaded asset URLs are reused by reference
 *
 * Usage:
 *   node scripts/db-clone-course-to-tts.mjs --source "AI Basics" --title "AI-course-duplicate"
 *   node scripts/db-clone-course-to-tts.mjs --source-id "course-..." --title "AI-course-duplicate"
 *   node scripts/db-clone-course-to-tts.mjs --list
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

loadEnv();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("❌ DATABASE_URL is required in .env");
  process.exit(1);
}

const sourceId = argValue("--source-id");
const sourceTitle = argValue("--source");
const targetTitle = argValue("--title");
const listOnly = hasArg("--list");

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  if (listOnly) {
    const rows = await sql`
      SELECT id, title, created_at
      FROM course_modules
      ORDER BY created_at DESC
    `;
    console.table(rows);
    process.exit(0);
  }

  if ((!sourceId && !sourceTitle) || !targetTitle?.trim()) {
    console.error(
      'Usage: node scripts/db-clone-course-to-tts.mjs --source "AI Basics" --title "AI-course-duplicate"',
    );
    process.exit(1);
  }

  const sourceRows = sourceId
    ? await sql`
        SELECT *
        FROM course_modules
        WHERE id = ${sourceId}
        LIMIT 1
      `
    : await sql`
        SELECT *
        FROM course_modules
        WHERE LOWER(title) LIKE LOWER(${`%${sourceTitle}%`})
        ORDER BY created_at DESC
        LIMIT 1
      `;

  if (sourceRows.length === 0) {
    throw new Error("Source course not found in course_modules.");
  }

  const source = sourceRows[0];

  const existingClone = await sql`
    SELECT id, title
    FROM tts_course_modules
    WHERE LOWER(title) = LOWER(${targetTitle.trim()})
    LIMIT 1
  `;

  if (existingClone.length > 0) {
    throw new Error(
      `A TTS sandbox course with title "${targetTitle.trim()}" already exists (${existingClone[0].id}).`,
    );
  }

  const newId = `tts-course-${slugify(targetTitle)}-${Date.now()}`;

  const stepRows = await sql`
    SELECT step_order, step_type, title, config
    FROM course_module_steps
    WHERE module_id = ${String(source.id)}
    ORDER BY step_order
  `;

  const questionRows = await sql`
    SELECT id, slide_index, prompt, correct_option_id, explanation, created_at
    FROM course_mcq_questions
    WHERE module_id = ${String(source.id)}
    ORDER BY id
  `;

  const optionRows = await sql`
    SELECT o.id, o.question_id, o.label
    FROM course_mcq_options o
    INNER JOIN course_mcq_questions q ON q.id = o.question_id
    WHERE q.module_id = ${String(source.id)}
    ORDER BY o.question_id, o.id
  `;

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO tts_course_modules (
        id,
        source_module_id,
        title,
        description,
        slide_count,
        duration_minutes,
        content_type,
        pdf_url,
        feedback_required,
        status_default,
        content_hash,
        mcq_generation_status,
        tts_enabled,
        avatar_enabled
      )
      VALUES (
        ${newId},
        ${String(source.id)},
        ${targetTitle.trim()},
        ${String(source.description ?? "")},
        ${Number(source.slide_count ?? 1)},
        ${Number(source.duration_minutes ?? 30)},
        ${String(source.content_type ?? "text")},
        ${source.pdf_url ?? null},
        ${Boolean(source.feedback_required)},
        'not_started',
        ${source.content_hash ?? null},
        ${String(source.mcq_generation_status ?? "completed")},
        true,
        true
      )
    `;

    for (const step of stepRows) {
      await tx`
        INSERT INTO tts_course_module_steps (
          module_id, step_order, step_type, title, config
        )
        VALUES (
          ${newId},
          ${Number(step.step_order)},
          ${String(step.step_type)},
          ${String(step.title)},
          ${step.config}
        )
      `;
    }

    for (const question of questionRows) {
      const oldQuestionId = String(question.id);
      const newQuestionId = oldQuestionId.startsWith(`${source.id}-`)
        ? oldQuestionId.replace(`${source.id}-`, `${newId}-`)
        : `${newId}-${oldQuestionId}`;

      await tx`
        INSERT INTO tts_course_mcq_questions (
          id, module_id, slide_index, prompt, correct_option_id, explanation, created_at
        )
        VALUES (
          ${newQuestionId},
          ${newId},
          ${Number(question.slide_index ?? 0)},
          ${String(question.prompt)},
          ${String(question.correct_option_id)},
          ${question.explanation ?? null},
          ${question.created_at}
        )
      `;

      const options = optionRows.filter((opt) => String(opt.question_id) === oldQuestionId);
      for (const option of options) {
        await tx`
          INSERT INTO tts_course_mcq_options (id, question_id, label)
          VALUES (
            ${String(option.id)},
            ${newQuestionId},
            ${String(option.label)}
          )
        `;
      }
    }
  });

  console.log("✅ TTS sandbox course cloned successfully.");
  console.log(`   Source course : ${String(source.title)} (${String(source.id)})`);
  console.log(`   Sandbox clone : ${targetTitle.trim()} (${newId})`);
  console.log(`   Steps copied  : ${stepRows.length}`);
  console.log(`   MCQs copied   : ${questionRows.length}`);
  console.log("   Batch links   : not copied");
  console.log("   Learner data  : not copied");
  console.log("   Asset blobs   : reused through existing course_assets URLs");
} catch (err) {
  console.error("❌ TTS sandbox clone failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

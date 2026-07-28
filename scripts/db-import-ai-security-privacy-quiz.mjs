import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const QUIZ_SRC = path.join(
  root,
  "content-kit",
  "interactive-html",
  "ai_security_privacy_compliance_questions.json",
);
const DEFAULT_TITLE = "AI Security, Privacy & Compliance";

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith("\"") && val.endsWith("\"")) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const out = {
    moduleId: "",
    title: DEFAULT_TITLE,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--moduleId" && argv[i + 1]) {
      out.moduleId = argv[++i];
    } else if (argv[i] === "--title" && argv[i + 1]) {
      out.title = argv[++i];
    }
  }
  return out;
}

function normalizeCorrect(correctOptionId, correctOptionIds) {
  if (Array.isArray(correctOptionIds) && correctOptionIds.length) {
    return correctOptionIds.map((x) => String(x).trim().toLowerCase()).join(",");
  }
  if (correctOptionId == null) return null;
  return String(correctOptionId)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
}

async function upsertQuizStep(sql, moduleId, questionCount) {
  const configJson = JSON.stringify({ questionCount });
  await sql`
    INSERT INTO course_module_steps (module_id, step_order, step_type, title, config)
    VALUES (${moduleId}, 6, 'quiz', 'Assessment quiz', ${configJson}::jsonb)
    ON CONFLICT (module_id, step_type) DO UPDATE SET
      step_order = EXCLUDED.step_order,
      title = EXCLUDED.title,
      config = EXCLUDED.config,
      updated_at = NOW()
  `;
}

async function resolveModuleId(sql, args) {
  if (args.moduleId) return args.moduleId;
  const rows = await sql`
    SELECT id
    FROM course_modules
    WHERE lower(title) = lower(${args.title})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) {
    throw new Error(
      `No course module found with title "${args.title}". Pass --moduleId <id> or seed the module first.`,
    );
  }
  return String(rows[0].id);
}

async function importQuiz(sql, moduleId, questions) {
  await sql`DELETE FROM course_mcq_options WHERE question_id IN (
    SELECT id FROM course_mcq_questions WHERE module_id = ${moduleId}
  )`;
  await sql`DELETE FROM course_mcq_questions WHERE module_id = ${moduleId}`;

  let imported = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const optionIds = new Set(q.options.map((o) => String(o.id).trim().toLowerCase()));
    const correctStored = normalizeCorrect(q.correctOptionId, q.correctOptionIds);
    if (!correctStored) throw new Error(`Question ${i + 1}: missing correct answer`);
    for (const id of correctStored.split(",")) {
      if (!optionIds.has(id)) {
        throw new Error(`Question ${i + 1}: correct "${id}" not in options`);
      }
    }

    const qId = `${moduleId}-q-${i + 1}`;
    await sql`
      INSERT INTO course_mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation)
      VALUES (
        ${qId},
        ${moduleId},
        0,
        ${String(q.prompt).trim()},
        ${correctStored},
        ${q.explanation ? String(q.explanation).trim() : null}
      )
    `;

    for (const opt of q.options) {
      await sql`
        INSERT INTO course_mcq_options (id, question_id, label)
        VALUES (
          ${String(opt.id).trim().toLowerCase()},
          ${qId},
          ${String(opt.label).trim()}
        )
      `;
    }
    imported++;
  }

  await upsertQuizStep(sql, moduleId, imported);
  return imported;
}

loadEnv();
const dbUrl = process.env.DATABASE_URL || process.env.postgres_neon;
if (!dbUrl) throw new Error("DATABASE_URL is required.");
if (!fs.existsSync(QUIZ_SRC)) throw new Error(`Missing quiz file: ${QUIZ_SRC}`);

const args = parseArgs(process.argv);
const sql = neon(dbUrl);

try {
  const quizRaw = JSON.parse(fs.readFileSync(QUIZ_SRC, "utf8"));
  const questions = Array.isArray(quizRaw) ? quizRaw : quizRaw.questions;
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error("Quiz JSON has no questions.");
  }

  const moduleId = await resolveModuleId(sql, args);
  const imported = await importQuiz(sql, moduleId, questions);

  await sql`
    UPDATE course_modules
    SET mcq_generation_status = 'completed',
        updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  console.log(`Imported ${imported} questions into ${moduleId}`);
} catch (err) {
  console.error(err?.message || err);
  process.exitCode = 1;
}

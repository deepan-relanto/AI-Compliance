/**
 * Migrate AI course data from shared compliance tables into course_* tables.
 *
 * Usage:
 *   node scripts/db-migrate-course-data.mjs --dry-run
 *   node scripts/db-migrate-course-data.mjs --copy
 *   node scripts/db-migrate-course-data.mjs --copy --verify
 *   node scripts/db-migrate-course-data.mjs --prune-shared   (after verify; backs up first)
 *   node scripts/db-migrate-course-data.mjs --export-json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backupDir = path.join(root, "scripts", "migration-backups");

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
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const doCopy = args.has("--copy");
const doVerify = args.has("--verify");
const doPrune = args.has("--prune-shared");
const doExport = args.has("--export-json");

if (!dryRun && !doCopy && !doVerify && !doPrune && !doExport) {
  console.log("Specify --dry-run, --copy, --verify, --prune-shared, and/or --export-json");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

async function getCourseModuleIds() {
  const sharedRows = await sql`
    SELECT id FROM training_modules
    WHERE module_kind = 'course' OR id LIKE 'course-%'
  `;
  const courseRows = await sql`SELECT id FROM course_modules`;
  const ids = new Set([
    ...sharedRows.map((r) => String(r.id)),
    ...courseRows.map((r) => String(r.id)),
  ]);
  return [...ids].sort();
}

async function countShared(courseIds) {
  if (courseIds.length === 0) {
    return {
      modules: 0,
      batches: 0,
      steps: 0,
      questions: 0,
      options: 0,
      progress: 0,
      reviews: 0,
      feedback: 0,
      notifications: 0,
    };
  }
  const [modules, batches, steps, questions, options, progress, reviews, feedback, notifications] =
    await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM training_modules WHERE id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM module_batches WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM module_steps WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM mcq_questions WHERE module_id = ANY(${courseIds})`,
      sql`
        SELECT COUNT(*)::int AS c FROM mcq_options
        WHERE question_id IN (SELECT id FROM mcq_questions WHERE module_id = ANY(${courseIds}))
      `,
      sql`SELECT COUNT(*)::int AS c FROM assessment_progress WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM review_requests WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM feedback_entries WHERE assessment_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM training_notifications WHERE module_id = ANY(${courseIds})`,
    ]);
  return {
    modules: Number(modules[0]?.c ?? 0),
    batches: Number(batches[0]?.c ?? 0),
    steps: Number(steps[0]?.c ?? 0),
    questions: Number(questions[0]?.c ?? 0),
    options: Number(options[0]?.c ?? 0),
    progress: Number(progress[0]?.c ?? 0),
    reviews: Number(reviews[0]?.c ?? 0),
    feedback: Number(feedback[0]?.c ?? 0),
    notifications: Number(notifications[0]?.c ?? 0),
  };
}

async function countCourse(courseIds) {
  if (courseIds.length === 0) {
    return {
      modules: 0,
      batches: 0,
      steps: 0,
      questions: 0,
      options: 0,
      progress: 0,
      reviews: 0,
      feedback: 0,
      notifications: 0,
    };
  }
  const [modules, batches, steps, questions, options, progress, reviews, feedback, notifications] =
    await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM course_modules WHERE id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM course_module_batches WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM course_module_steps WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM course_mcq_questions WHERE module_id = ANY(${courseIds})`,
      sql`
        SELECT COUNT(*)::int AS c FROM course_mcq_options
        WHERE question_id IN (SELECT id FROM course_mcq_questions WHERE module_id = ANY(${courseIds}))
      `,
      sql`SELECT COUNT(*)::int AS c FROM course_progress WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM course_review_requests WHERE module_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM course_feedback_entries WHERE assessment_id = ANY(${courseIds})`,
      sql`SELECT COUNT(*)::int AS c FROM course_notifications WHERE module_id = ANY(${courseIds})`,
    ]);
  return {
    modules: Number(modules[0]?.c ?? 0),
    batches: Number(batches[0]?.c ?? 0),
    steps: Number(steps[0]?.c ?? 0),
    questions: Number(questions[0]?.c ?? 0),
    options: Number(options[0]?.c ?? 0),
    progress: Number(progress[0]?.c ?? 0),
    reviews: Number(reviews[0]?.c ?? 0),
    feedback: Number(feedback[0]?.c ?? 0),
    notifications: Number(notifications[0]?.c ?? 0),
  };
}

function printCounts(label, counts) {
  console.log(`\n${label}:`);
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k}: ${v}`);
  }
}

async function exportBackup(courseIds) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(backupDir, `course-migration-${stamp}.json`);

  const payload = {
    exportedAt: new Date().toISOString(),
    courseModuleIds: courseIds,
    modules: await sql`
      SELECT * FROM training_modules WHERE id = ANY(${courseIds})
    `,
    batches: await sql`
      SELECT * FROM module_batches WHERE module_id = ANY(${courseIds})
    `,
    steps: await sql`
      SELECT * FROM module_steps WHERE module_id = ANY(${courseIds})
    `,
    questions: await sql`
      SELECT * FROM mcq_questions WHERE module_id = ANY(${courseIds})
    `,
    options: await sql`
      SELECT o.* FROM mcq_options o
      INNER JOIN mcq_questions q ON q.id = o.question_id
      WHERE q.module_id = ANY(${courseIds})
    `,
    progress: await sql`
      SELECT * FROM assessment_progress WHERE module_id = ANY(${courseIds})
    `,
    reviews: await sql`
      SELECT * FROM review_requests WHERE module_id = ANY(${courseIds})
    `,
    feedback: await sql`
      SELECT * FROM feedback_entries WHERE assessment_id = ANY(${courseIds})
    `,
    notifications: await sql`
      SELECT * FROM training_notifications WHERE module_id = ANY(${courseIds})
    `,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nBackup written: ${outPath}`);
  return outPath;
}

async function copyData(courseIds) {
  if (courseIds.length === 0) {
    console.log("No course modules to copy.");
    return;
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO course_modules (
        id, title, description, slide_count, duration_minutes, content_type,
        pdf_url, feedback_required, status_default, content_hash,
        mcq_generation_status, created_at, updated_at
      )
      SELECT
        id, title, description, slide_count, duration_minutes, content_type,
        pdf_url, feedback_required, status_default, content_hash,
        mcq_generation_status, created_at, updated_at
      FROM training_modules
      WHERE id = ANY(${courseIds})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        slide_count = EXCLUDED.slide_count,
        duration_minutes = EXCLUDED.duration_minutes,
        content_type = EXCLUDED.content_type,
        pdf_url = EXCLUDED.pdf_url,
        feedback_required = EXCLUDED.feedback_required,
        status_default = EXCLUDED.status_default,
        content_hash = EXCLUDED.content_hash,
        mcq_generation_status = EXCLUDED.mcq_generation_status,
        updated_at = EXCLUDED.updated_at
    `;

    await tx`
      INSERT INTO course_module_batches (module_id, batch_id)
      SELECT module_id, batch_id FROM module_batches
      WHERE module_id = ANY(${courseIds})
      ON CONFLICT DO NOTHING
    `;

    await tx`
      INSERT INTO course_module_steps (id, module_id, step_order, step_type, title, config, created_at, updated_at)
      SELECT id, module_id, step_order, step_type, title, config, created_at, updated_at
      FROM module_steps
      WHERE module_id = ANY(${courseIds})
      ON CONFLICT (module_id, step_type) DO UPDATE SET
        step_order = EXCLUDED.step_order,
        title = EXCLUDED.title,
        config = EXCLUDED.config,
        updated_at = EXCLUDED.updated_at
    `;

    await tx`
      INSERT INTO course_mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation, created_at)
      SELECT id, module_id, slide_index, prompt, correct_option_id, explanation, created_at
      FROM mcq_questions
      WHERE module_id = ANY(${courseIds})
      ON CONFLICT (id) DO UPDATE SET
        slide_index = EXCLUDED.slide_index,
        prompt = EXCLUDED.prompt,
        correct_option_id = EXCLUDED.correct_option_id,
        explanation = EXCLUDED.explanation
    `;

    await tx`
      INSERT INTO course_mcq_options (id, question_id, label)
      SELECT o.id, o.question_id, o.label
      FROM mcq_options o
      INNER JOIN mcq_questions q ON q.id = o.question_id
      WHERE q.module_id = ANY(${courseIds})
      ON CONFLICT (question_id, id) DO UPDATE SET label = EXCLUDED.label
    `;

    await tx`
      INSERT INTO course_progress (
        id, user_email, module_id, module_title, batch_id, current_slide, total_slides,
        status, warning_count, warning_history, archived_warnings, retake_count,
        failed_at, failed_reason, last_failure_at, last_failure_reason,
        acknowledgement, mcq_correct, mcq_total, score_percent, mcq_answers,
        last_accessed_at, completed_at, created_at, updated_at
      )
      SELECT
        id, user_email, module_id, module_title, batch_id, current_slide, total_slides,
        status, warning_count, warning_history, archived_warnings, retake_count,
        failed_at, failed_reason, last_failure_at, last_failure_reason,
        acknowledgement, mcq_correct, mcq_total, score_percent, mcq_answers,
        last_accessed_at, completed_at, created_at, updated_at
      FROM assessment_progress
      WHERE module_id = ANY(${courseIds})
      ON CONFLICT (user_email, module_id) DO UPDATE SET
        module_title = EXCLUDED.module_title,
        batch_id = EXCLUDED.batch_id,
        current_slide = EXCLUDED.current_slide,
        total_slides = EXCLUDED.total_slides,
        status = EXCLUDED.status,
        warning_count = EXCLUDED.warning_count,
        warning_history = EXCLUDED.warning_history,
        archived_warnings = EXCLUDED.archived_warnings,
        retake_count = EXCLUDED.retake_count,
        failed_at = EXCLUDED.failed_at,
        failed_reason = EXCLUDED.failed_reason,
        last_failure_at = EXCLUDED.last_failure_at,
        last_failure_reason = EXCLUDED.last_failure_reason,
        acknowledgement = EXCLUDED.acknowledgement,
        mcq_correct = EXCLUDED.mcq_correct,
        mcq_total = EXCLUDED.mcq_total,
        score_percent = EXCLUDED.score_percent,
        mcq_answers = EXCLUDED.mcq_answers,
        last_accessed_at = EXCLUDED.last_accessed_at,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at
    `;

    await tx`
      INSERT INTO course_review_requests (
        id, username, module_id, module_title, warning_count, failure_timestamp,
        user_explanation, status, submitted_timestamp, decision_timestamp,
        approved_by, approved_at, rejected_by, rejected_at, admin_comment, created_at
      )
      SELECT
        id, username, module_id, module_title, warning_count, failure_timestamp,
        user_explanation, status, submitted_timestamp, decision_timestamp,
        approved_by, approved_at, rejected_by, rejected_at, admin_comment, created_at
      FROM review_requests
      WHERE module_id = ANY(${courseIds})
      ON CONFLICT (id) DO NOTHING
    `;

    await tx`
      INSERT INTO course_feedback_entries (
        id, user_id, user_name, assessment_id, assessment_name, feedback_text, created_at
      )
      SELECT id, user_id, user_name, assessment_id, assessment_name, feedback_text, created_at
      FROM feedback_entries
      WHERE assessment_id = ANY(${courseIds})
      ON CONFLICT (id) DO NOTHING
    `;

    await tx`
      INSERT INTO course_notifications (id, module_id, user_email, notification_type, sent_at)
      SELECT id, module_id, user_email, notification_type, sent_at
      FROM training_notifications
      WHERE module_id = ANY(${courseIds})
      ON CONFLICT (module_id, user_email, notification_type) DO NOTHING
    `;
  });

  console.log("\n✅ Copy complete.");
}

async function pruneShared(courseIds) {
  if (courseIds.length === 0) return;
  await exportBackup(courseIds);
  const deleted = await sql`
    DELETE FROM training_modules
    WHERE id = ANY(${courseIds})
    RETURNING id
  `;
  console.log(`\n✅ Pruned ${deleted.length} course module(s) from shared training_modules (CASCADE).`);
}

try {
  const courseIds = await getCourseModuleIds();
  console.log(`Course module IDs (${courseIds.length}):`, courseIds.join(", ") || "(none)");

  if (dryRun || doVerify || doCopy) {
    const shared = await countShared(courseIds);
    const course = await countCourse(courseIds);
    printCounts("Shared tables (source)", shared);
    printCounts("Course tables (target)", course);
  }

  if (doExport) {
    await exportBackup(courseIds);
  }

  if (doCopy) {
    if (dryRun) {
      console.log("\n[dry-run] Would copy data to course_* tables.");
    } else {
      await copyData(courseIds);
    }
  }

  if (doVerify && !dryRun) {
    const shared = await countShared(courseIds);
    const course = await countCourse(courseIds);
    if (doCopy) {
      printCounts("\nShared tables (after copy)", shared);
      printCounts("Course tables (after copy)", course);
    }
    const ok = Object.keys(shared).every((k) => shared[k] === course[k]);
    console.log(ok ? "\n✅ Verify OK — counts match." : "\n❌ Verify FAILED — counts differ.");
    if (!ok) process.exit(1);
  }

  if (doPrune) {
    if (dryRun) {
      console.log("\n[dry-run] Would prune course rows from shared tables.");
    } else {
      await pruneShared(courseIds);
    }
  }
} catch (err) {
  console.error("❌ Migration error:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

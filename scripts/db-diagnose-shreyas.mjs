/**
 * Diagnose Shreyas batch/mail/progress state. Read-only.
 * Usage: node scripts/db-diagnose-shreyas.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
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

loadEnv();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("❌ Set DATABASE_URL in .env");
  process.exit(1);
}

const sql = neon(url);
const email = "shreyas.shankar@relanto.ai";

const user = await sql`
  SELECT email, role, batch_id, display_name FROM users
  WHERE LOWER(email) = LOWER(${email})
`;
const progress = await sql`
  SELECT user_email, module_id, module_title, batch_id, status, retake_count,
         score_percent, mcq_correct, mcq_total, completed_at
  FROM assessment_progress
  WHERE LOWER(user_email) = LOWER(${email})
`;
const batches = await sql`
  SELECT id, label, description, member_count FROM batches ORDER BY label
`;
const notifications = await sql`
  SELECT module_id, notification_type, sent_at FROM training_notifications
  WHERE LOWER(user_email) = LOWER(${email})
  ORDER BY sent_at DESC
`;
const moduleAssign = await sql`
  SELECT mb.module_id, mb.batch_id, b.label AS batch_label, tm.title, tm.mcq_generation_status
  FROM module_batches mb
  JOIN batches b ON b.id = mb.batch_id
  JOIN training_modules tm ON tm.id = mb.module_id
  WHERE tm.title ILIKE '%security%' OR tm.id ILIKE '%security%'
  ORDER BY tm.created_at DESC
`;
const mismatchedProgress = await sql`
  SELECT ap.user_email, ap.batch_id AS progress_batch, u.batch_id AS user_batch,
         ap.module_title, ap.status
  FROM assessment_progress ap
  JOIN users u ON LOWER(u.email) = LOWER(ap.user_email)
  WHERE ap.batch_id IS DISTINCT FROM u.batch_id
  LIMIT 20
`;

console.log(JSON.stringify({
  user,
  progress,
  batches,
  notifications,
  moduleAssign,
  mismatchedProgress,
}, null, 2));

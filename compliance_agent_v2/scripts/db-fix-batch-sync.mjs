/**
 * Fix batch/progress/mail alignment for Shreyas and all mismatched users.
 * Usage: node scripts/db-fix-batch-sync.mjs
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

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("❌ Set DATABASE_URL in .env");
  process.exit(1);
}

const sql = neon(url);
const MODULE_ID = "security-awareness-may2026-mqhk9xmk";
const TESTING_BATCH = "testing_team_sadz";

console.log("1. Sync assessment_progress.batch_id → users.batch_id (all mismatches)…");
const synced = await sql`
  UPDATE assessment_progress ap
  SET batch_id = u.batch_id,
      updated_at = NOW()
  FROM users u
  WHERE LOWER(ap.user_email) = LOWER(u.email)
    AND u.batch_id IS NOT NULL
    AND ap.batch_id IS DISTINCT FROM u.batch_id
  RETURNING ap.user_email, ap.module_title, ap.batch_id
`;
for (const row of synced) {
  console.log(`   ${row.user_email} / ${row.module_title} → ${row.batch_id}`);
}
if (synced.length === 0) console.log("   (none)");

console.log("\n2. Assign Security Awareness module to Testing_team batch…");
const assigned = await sql`
  INSERT INTO module_batches (module_id, batch_id)
  VALUES (${MODULE_ID}, ${TESTING_BATCH})
  ON CONFLICT DO NOTHING
  RETURNING module_id, batch_id
`;
console.log(assigned.length ? `   linked ${MODULE_ID} → ${TESTING_BATCH}` : "   already linked");

console.log("\n3. Fix stuck progress (retake_count >= 2, no score, in_progress)…");
const reset = await sql`
  UPDATE assessment_progress
  SET status = 'in_progress',
      retake_count = 0,
      mcq_answers = '{}'::jsonb,
      mcq_correct = 0,
      score_percent = NULL,
      failed_reason = NULL,
      last_failure_at = NULL,
      last_failure_reason = NULL,
      current_slide = 0,
      updated_at = NOW()
  WHERE retake_count >= 2
    AND score_percent IS NULL
    AND status = 'in_progress'
    AND completed_at IS NULL
  RETURNING user_email, module_title, retake_count, batch_id
`;
for (const row of reset) {
  console.log(`   reset ${row.user_email} / ${row.module_title} (batch ${row.batch_id})`);
}
if (reset.length === 0) console.log("   (none)");

console.log("\n4. Clear invite dedupe for testing_team users on this module (allows resend)…");
const cleared = await sql`
  DELETE FROM training_notifications tn
  USING users u
  WHERE tn.module_id = ${MODULE_ID}
    AND tn.notification_type = 'invited'
    AND LOWER(tn.user_email) = LOWER(u.email)
    AND u.batch_id = ${TESTING_BATCH}
  RETURNING tn.user_email
`;
for (const row of cleared) {
  console.log(`   cleared invite record for ${row.user_email}`);
}
if (cleared.length === 0) console.log("   (none)");

console.log("\n5. Verify Shreyas…");
const shreyas = await sql`
  SELECT u.email, u.batch_id AS user_batch, b.label AS user_batch_label,
         ap.batch_id AS progress_batch, ap.status, ap.retake_count, ap.score_percent
  FROM users u
  LEFT JOIN batches b ON b.id = u.batch_id
  LEFT JOIN assessment_progress ap ON LOWER(ap.user_email) = LOWER(u.email)
    AND ap.module_id = ${MODULE_ID}
  WHERE LOWER(u.email) = LOWER('shreyas.shankar@relanto.ai')
`;
console.log(JSON.stringify(shreyas, null, 2));

console.log("\n✅ Done. Refresh monitoring; use admin Send invites to resend mail.");

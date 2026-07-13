/**
 * Fix learners with approved review but stuck failed/permanently_failed progress.
 * Usage: node scripts/db-fix-approved-retakes.mjs
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
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT DISTINCT ON (rr.username, rr.module_id)
    rr.username,
    rr.module_id,
    rr.module_title,
    rr.status AS review_status,
    ap.status AS progress_status,
    ap.retake_count,
    ap.warning_count
  FROM review_requests rr
  INNER JOIN assessment_progress ap
    ON LOWER(ap.user_email) = LOWER(rr.username)
    AND ap.module_id = rr.module_id
  WHERE rr.status = 'Approved'
    AND ap.status IN ('failed', 'permanently_failed', 'in_progress')
  ORDER BY rr.username, rr.module_id, rr.decision_timestamp DESC NULLS LAST
`;

console.log(`Found ${rows.length} approved review(s) with non-ready progress…\n`);

for (const row of rows) {
  const updated = await sql`
    UPDATE assessment_progress
    SET status = 'not_started',
        warning_count = 0,
        warning_history = '[]'::jsonb,
        current_slide = 0,
        mcq_answers = '{}'::jsonb,
        mcq_correct = 0,
        score_percent = NULL,
        failed_at = NULL,
        failed_reason = NULL,
        last_failure_at = NULL,
        last_failure_reason = NULL,
        completed_at = NULL,
        acknowledgement = NULL,
        updated_at = NOW()
    WHERE LOWER(user_email) = LOWER(${row.username})
      AND module_id = ${row.module_id}
    RETURNING user_email, module_title, status, retake_count
  `;
  console.log(`  fixed ${row.username} / ${row.module_title}: ${row.progress_status} → not_started`);
  console.log(`    retake_count kept at ${updated[0]?.retake_count ?? row.retake_count}`);
}

console.log("\n✅ Done.");

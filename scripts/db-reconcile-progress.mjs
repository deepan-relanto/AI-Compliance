/**
 * Maintenance script: reconcile invalid progress scores and passed statuses.
 * Run manually when needed instead of on every analytics load.
 *
 * Usage: npm run db:reconcile-progress
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

const url = process.env.DATABASE_URL || process.env.postgres_neon;
if (!url) {
  console.error("DATABASE_URL (or postgres_neon) is required in .env");
  process.exit(1);
}

const sql = neon(url);
const PASS_THRESHOLD = 70;

console.log("Running progress reconciliation...\n");

// 1. Fix score_percent > 100
const cappedRows = await sql`
  UPDATE assessment_progress
  SET score_percent = 100, updated_at = NOW()
  WHERE score_percent > 100
  RETURNING user_email, module_id, score_percent
`;
console.log(`[1/2] Capped ${cappedRows.length} score(s) at 100%.`);

// 2. Fix status = 'passed' or 'completed' where score < threshold
const statusRows = await sql`
  UPDATE assessment_progress
  SET status = 'completed', updated_at = NOW()
  WHERE status != 'completed'
    AND score_percent IS NOT NULL
    AND score_percent >= ${PASS_THRESHOLD}
    AND status NOT IN ('permanently_failed', 'failed')
  RETURNING user_email, module_id, status, score_percent
`;
console.log(`[2/2] Fixed ${statusRows.length} status(es) to completed.`);
for (const r of statusRows) {
  console.log(`  - ${r.user_email} / ${r.module_id} (${r.score_percent}%)`);
}

console.log("\nDone.");

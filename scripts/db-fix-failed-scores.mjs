/**
 * Migrates score-based failures from status `failed` to `in_progress`.
 * Proctor failures (failed with no score_percent) are unchanged.
 *
 * Usage: npm run db:fix-failed-scores
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

const rows = await sql`
  UPDATE assessment_progress
  SET status = 'in_progress', updated_at = NOW()
  WHERE status = 'failed' AND score_percent IS NOT NULL
  RETURNING user_email, module_id, score_percent
`;

console.log(`Migrated ${rows.length} row(s) from failed → in_progress (score-based).`);
for (const r of rows) {
  console.log(`  - ${r.user_email} / ${r.module_id} (${r.score_percent}%)`);
}

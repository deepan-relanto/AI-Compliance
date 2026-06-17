/**
 * Clears all learner activity/score data but keeps:
 *   - users (logins)
 *   - batches
 *   - training_modules + mcq_questions + mcq_options + module_batches + upload_files
 *
 * Usage: npm run db:clear-progress
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

console.log("🧹 Clearing learner activity (keeping users, batches, modules, MCQs)…");

await sql`DELETE FROM assessment_progress`;
console.log("  · assessment_progress cleared");

await sql`DELETE FROM feedback_entries`;
console.log("  · feedback_entries cleared");

await sql`DELETE FROM review_requests`;
console.log("  · review_requests cleared");

await sql`DELETE FROM audit_logs`;
console.log("  · audit_logs cleared");

await sql`DELETE FROM live_sessions`;
console.log("  · live_sessions cleared");

// Reset compliance / pass / fail counters on batches so the new analytics
// start from zero (these were seeded with mock numbers).
await sql`
  UPDATE batches
  SET compliance = 0, pass_rate = 0, fail_rate = 0, active_sessions = 0,
      updated_at = NOW()
`;
console.log("  · batches compliance counters reset");

console.log("\n✅ Cleanup complete. Logins, training PDFs, and MCQs are unchanged.");

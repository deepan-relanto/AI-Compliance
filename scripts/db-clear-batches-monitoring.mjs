/**
 * Clears batches, batch assignments, and monitoring data.
 * Keeps training modules, MCQs, PDF storage, upload metadata, employees, and users.
 *
 * Usage: npm run db:clear-batches-monitoring
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

console.log("🧹 Clearing batches and monitoring (keeping PDFs + MCQs)…\n");

const tables = [
  ["training_notifications", await sql`DELETE FROM training_notifications RETURNING id`],
  ["assessment_progress", await sql`DELETE FROM assessment_progress RETURNING id`],
  ["feedback_entries", await sql`DELETE FROM feedback_entries RETURNING id`],
  ["review_requests", await sql`DELETE FROM review_requests RETURNING id`],
  ["audit_logs", await sql`DELETE FROM audit_logs RETURNING id`],
  ["live_sessions", await sql`DELETE FROM live_sessions RETURNING id`],
  ["module_batches", await sql`DELETE FROM module_batches RETURNING module_id`],
];

for (const [name, rows] of tables) {
  console.log(`  · ${name}: ${rows.length} row(s) removed`);
}

const users = await sql`
  UPDATE users
  SET batch_id = NULL, updated_at = NOW()
  WHERE batch_id IS NOT NULL
  RETURNING id
`;
console.log(`  · users batch_id cleared: ${users.length} row(s)`);

const batches = await sql`DELETE FROM batches RETURNING id`;
console.log(`  · batches: ${batches.length} row(s) removed`);

const kept = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM training_modules) AS modules,
    (SELECT COUNT(*)::int FROM mcq_questions) AS questions,
    (SELECT COUNT(*)::int FROM pdf_storage) AS pdf_files
`;
const stats = kept[0];

console.log("\n✅ Done.");
console.log(`   Kept: ${stats.modules} module(s), ${stats.questions} MCQ question(s), ${stats.pdf_files} stored PDF(s)`);
console.log("   Tip: hard-refresh the browser (Ctrl+Shift+R) to clear cached local progress.");

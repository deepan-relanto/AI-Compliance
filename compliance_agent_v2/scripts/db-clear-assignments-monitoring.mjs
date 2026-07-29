/**
 * Clears batch assignments and all monitoring/progress data.
 * Keeps batches, training modules, MCQs, PDF storage, employees, and users.
 *
 * Usage:
 *   npm run db:clear-assignments-monitoring -- --dry-run
 *   npm run db:clear-assignments-monitoring -- --confirm
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireDestructiveConfirm } from "./lib/destructive-guard.mjs";

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

const { dryRun } = requireDestructiveConfirm("db-clear-assignments-monitoring.mjs", {
  description: "Clears batch assignments and monitoring/progress (keeps batches, modules, MCQs, PDFs).",
});

const sql = neon(url);

console.log("🧹 Clearing assignments & monitoring (keeping batches, PDFs, MCQs)…\n");

const tableNames = [
  "training_notifications",
  "assessment_progress",
  "feedback_entries",
  "review_requests",
  "audit_logs",
  "live_sessions",
  "module_batches",
];

if (dryRun) {
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM training_notifications) AS training_notifications,
      (SELECT COUNT(*)::int FROM assessment_progress) AS assessment_progress,
      (SELECT COUNT(*)::int FROM feedback_entries) AS feedback_entries,
      (SELECT COUNT(*)::int FROM review_requests) AS review_requests,
      (SELECT COUNT(*)::int FROM audit_logs) AS audit_logs,
      (SELECT COUNT(*)::int FROM live_sessions) AS live_sessions,
      (SELECT COUNT(*)::int FROM module_batches) AS module_batches,
      (SELECT COUNT(*)::int FROM batches) AS batches
  `;
  const c = counts[0];
  console.log("[dry-run] Would delete:");
  for (const name of tableNames) {
    console.log(`  · ${name}: ${c[name]} row(s)`);
  }
  console.log(`  · batches: reset compliance counters on ${c.batches} row(s)`);
  console.log("\nNo changes written. Pass --confirm to execute.");
  process.exit(0);
}

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

await sql`
  UPDATE batches
  SET compliance = 0, pass_rate = 0, fail_rate = 0, active_sessions = 0, updated_at = NOW()
`;

const kept = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM batches) AS batches,
    (SELECT COUNT(*)::int FROM training_modules) AS modules,
    (SELECT COUNT(*)::int FROM mcq_questions) AS questions,
    (SELECT COUNT(*)::int FROM pdf_storage) AS pdf_files
`;
const stats = kept[0];

console.log("\n✅ Done.");
console.log(
  `   Kept: ${stats.batches} batch(es), ${stats.modules} module(s), ${stats.questions} MCQ(s), ${stats.pdf_files} PDF(s)`,
);
console.log("   Tip: learners should refresh the dashboard once to clear browser progress cache.");

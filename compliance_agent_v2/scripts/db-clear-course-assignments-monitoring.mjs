/**
 * Clear ALL course assignments + course learner/monitoring state.
 * Keeps course bundles (modules, steps, MCQs, assets).
 * Does NOT touch security compliance tables.
 *
 * Usage: node scripts/db-clear-course-assignments-monitoring.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

console.log("Clearing course assignments + monitoring (keeping course bundles)…\n");

const before = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM course_module_batches) AS assignments,
    (SELECT COUNT(*)::int FROM course_progress) AS progress,
    (SELECT COUNT(*)::int FROM course_notifications) AS notifications,
    (SELECT COUNT(*)::int FROM course_review_requests) AS reviews,
    (SELECT COUNT(*)::int FROM course_feedback_entries) AS feedback,
    (SELECT COUNT(*)::int FROM course_audit_logs) AS audit_logs,
    (SELECT COUNT(*)::int FROM course_modules) AS modules,
    (SELECT COUNT(*)::int FROM module_batches) AS compliance_assignments,
    (SELECT COUNT(*)::int FROM assessment_progress) AS compliance_progress
`;
console.log("BEFORE:", before[0]);

const n = await sql`DELETE FROM course_notifications RETURNING id`;
const f = await sql`DELETE FROM course_feedback_entries RETURNING id`;
const r = await sql`DELETE FROM course_review_requests RETURNING id`;
const p = await sql`DELETE FROM course_progress RETURNING id`;
const a = await sql`DELETE FROM course_audit_logs RETURNING id`;
const b = await sql`DELETE FROM course_module_batches RETURNING module_id, batch_id`;

const after = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM course_module_batches) AS assignments,
    (SELECT COUNT(*)::int FROM course_progress) AS progress,
    (SELECT COUNT(*)::int FROM course_notifications) AS notifications,
    (SELECT COUNT(*)::int FROM course_review_requests) AS reviews,
    (SELECT COUNT(*)::int FROM course_feedback_entries) AS feedback,
    (SELECT COUNT(*)::int FROM course_audit_logs) AS audit_logs,
    (SELECT COUNT(*)::int FROM course_modules) AS modules,
    (SELECT COUNT(*)::int FROM module_batches) AS compliance_assignments,
    (SELECT COUNT(*)::int FROM assessment_progress) AS compliance_progress
`;

console.log("\nCleared:");
console.log(`  course_notifications: ${n.length}`);
console.log(`  course_feedback_entries: ${f.length}`);
console.log(`  course_review_requests: ${r.length}`);
console.log(`  course_progress: ${p.length}`);
console.log(`  course_audit_logs: ${a.length}`);
console.log(`  course_module_batches: ${b.length}`);
console.log("\nAFTER:", after[0]);

const modules = await sql`SELECT id, title FROM course_modules ORDER BY title`;
console.log("\nKept course bundles:");
for (const m of modules) {
  console.log(`  · ${m.title} (${m.id})`);
}
console.log(
  "\nCompliance untouched (assignments:",
  after[0].compliance_assignments,
  ", progress:",
  after[0].compliance_progress,
  ").",
);

await sql.end();

/**
 * Clear course assignments + course monitoring/progress for all batches
 * EXCEPT Module_1_AI_Basics_Batch_1 and Relanto Leaders.
 * Never touches compliance tables.
 *
 * Usage:
 *   node scripts/db-clear-course-except-kept-batches.mjs --dry-run
 *   node scripts/db-clear-course-except-kept-batches.mjs --confirm
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { requireDestructiveConfirm } from "./lib/destructive-guard.mjs";

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

const { dryRun } = requireDestructiveConfirm("db-clear-course-except-kept-batches.mjs", {
  description: "Clears course data for all batches except kept batch IDs.",
});

/** Keep Module_1 AI Basics + Relanto Leaders intact. */
const KEEP_BATCH_IDS = [
  "module_1_ai_basics_batch_1_glvf",
  "relanto_leaders_8osk",
];

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const allBatches = await sql`
  SELECT id, label, member_count FROM batches ORDER BY label
`;
console.log("All batches:");
for (const b of allBatches) {
  const keep = KEEP_BATCH_IDS.includes(b.id) ? " KEEP" : "";
  console.log(`  ${b.id} | ${b.label} | ${b.member_count}${keep}`);
}

const missing = KEEP_BATCH_IDS.filter((id) => !allBatches.some((b) => b.id === id));
if (missing.length) {
  console.error("\nERROR: Keep-batch id(s) not found:", missing.join(", "));
  console.error("Aborting — refine KEEP_BATCH_IDS before running.");
  await sql.end();
  process.exit(1);
}

const keepBatches = allBatches.filter((b) => KEEP_BATCH_IDS.includes(b.id));
const clearBatches = allBatches.filter((b) => !KEEP_BATCH_IDS.includes(b.id));
const clearIds = clearBatches.map((b) => b.id);

console.log("\nKeeping course data for:");
for (const b of keepBatches) console.log(`  · ${b.label} (${b.id})`);
console.log("\nClearing course data for:");
for (const b of clearBatches) console.log(`  · ${b.label} (${b.id})`);

const clearEmails = (
  await sql`
    SELECT LOWER(email) AS email FROM users WHERE batch_id = ANY(${clearIds})
  `
).map((r) => r.email);

console.log(`\nLearners in clear batches: ${clearEmails.length}`);

const before = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM course_module_batches) AS assignments,
    (SELECT COUNT(*)::int FROM course_progress) AS progress,
    (SELECT COUNT(*)::int FROM course_notifications) AS notifications,
    (SELECT COUNT(*)::int FROM course_review_requests) AS reviews,
    (SELECT COUNT(*)::int FROM course_feedback_entries) AS feedback,
    (SELECT COUNT(*)::int FROM course_audit_logs) AS audit_logs,
    (SELECT COUNT(*)::int FROM module_batches) AS compliance_assignments,
    (SELECT COUNT(*)::int FROM assessment_progress) AS compliance_progress
`;
console.log("\nBEFORE (global):", before[0]);

const previewAssign = await sql`
  SELECT cmb.batch_id, b.label, cm.title
  FROM course_module_batches cmb
  LEFT JOIN batches b ON b.id = cmb.batch_id
  LEFT JOIN course_modules cm ON cm.id = cmb.module_id
  WHERE cmb.batch_id = ANY(${clearIds})
  ORDER BY b.label, cm.title
`;
const previewProgress = await sql`
  SELECT batch_id, COUNT(*)::int AS n
  FROM course_progress
  WHERE batch_id = ANY(${clearIds})
     OR LOWER(user_email) = ANY(${clearEmails})
  GROUP BY batch_id
  ORDER BY n DESC
`;

console.log("\nCourse assignments to remove:");
if (!previewAssign.length) console.log("  (none)");
for (const a of previewAssign) {
  console.log(`  · ${a.label ?? a.batch_id} => ${a.title}`);
}
console.log("\nCourse progress rows to remove by batch:");
if (!previewProgress.length) console.log("  (none)");
for (const p of previewProgress) {
  console.log(`  · ${p.batch_id}: ${p.n}`);
}

if (dryRun) {
  console.log("\n[dry-run] No changes written.");
  await sql.end();
  process.exit(0);
}

// Course-only deletes scoped to non-kept batches / those learners.
const n = await sql`
  DELETE FROM course_notifications
  WHERE LOWER(user_email) = ANY(${clearEmails})
  RETURNING id
`;
const f = await sql`
  DELETE FROM course_feedback_entries
  WHERE LOWER(user_id) = ANY(${clearEmails})
  RETURNING id
`;
const r = await sql`
  DELETE FROM course_review_requests
  WHERE LOWER(username) = ANY(${clearEmails})
  RETURNING id
`;
const p = await sql`
  DELETE FROM course_progress
  WHERE batch_id = ANY(${clearIds})
     OR LOWER(user_email) = ANY(${clearEmails})
  RETURNING id
`;
const a = await sql`
  DELETE FROM course_audit_logs
  WHERE LOWER(actor) = ANY(${clearEmails})
  RETURNING id
`;
const b = await sql`
  DELETE FROM course_module_batches
  WHERE batch_id = ANY(${clearIds})
  RETURNING module_id, batch_id
`;

const after = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM course_module_batches) AS assignments,
    (SELECT COUNT(*)::int FROM course_progress) AS progress,
    (SELECT COUNT(*)::int FROM course_notifications) AS notifications,
    (SELECT COUNT(*)::int FROM course_review_requests) AS reviews,
    (SELECT COUNT(*)::int FROM course_feedback_entries) AS feedback,
    (SELECT COUNT(*)::int FROM course_audit_logs) AS audit_logs,
    (SELECT COUNT(*)::int FROM module_batches) AS compliance_assignments,
    (SELECT COUNT(*)::int FROM assessment_progress) AS compliance_progress
`;

const keptAssign = await sql`
  SELECT cmb.batch_id, b.label, cm.title
  FROM course_module_batches cmb
  LEFT JOIN batches b ON b.id = cmb.batch_id
  LEFT JOIN course_modules cm ON cm.id = cmb.module_id
  WHERE cmb.batch_id = ANY(${KEEP_BATCH_IDS})
  ORDER BY b.label, cm.title
`;
const keptProgress = await sql`
  SELECT batch_id, COUNT(*)::int AS n
  FROM course_progress
  WHERE batch_id = ANY(${KEEP_BATCH_IDS})
  GROUP BY batch_id
`;

console.log("\nCleared (course only, non-kept batches):");
console.log(`  course_notifications: ${n.length}`);
console.log(`  course_feedback_entries: ${f.length}`);
console.log(`  course_review_requests: ${r.length}`);
console.log(`  course_progress: ${p.length}`);
console.log(`  course_audit_logs: ${a.length}`);
console.log(`  course_module_batches: ${b.length}`);
console.log("\nAFTER (global):", after[0]);
console.log("\nRemaining course assignments (kept batches):");
if (!keptAssign.length) console.log("  (none)");
for (const row of keptAssign) {
  console.log(`  · ${row.label} => ${row.title}`);
}
console.log("\nRemaining course progress (kept batches):");
if (!keptProgress.length) console.log("  (none)");
for (const row of keptProgress) {
  console.log(`  · ${row.batch_id}: ${row.n}`);
}
console.log(
  "\nCompliance untouched (assignments:",
  after[0].compliance_assignments,
  ", progress:",
  after[0].compliance_progress,
  ").",
);

await sql.end();

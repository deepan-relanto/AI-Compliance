/**
 * Clear all course + compliance assignments and monitoring logs
 * for the Anumeha batch (anumeha_4rk4).
 *
 * Usage:
 *   node scripts/db-clear-anumeha-batch.mjs --dry-run
 *   node scripts/db-clear-anumeha-batch.mjs --confirm
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

const { dryRun } = requireDestructiveConfirm("db-clear-anumeha-batch.mjs", {
  description: "Clears course + compliance assignments and monitoring for the Anumeha batch.",
});

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const userRows = await sql`
  SELECT email, display_name, batch_id
  FROM users
  WHERE LOWER(email) LIKE '%anumeha%'
  ORDER BY email
`;

if (!userRows.length) {
  console.error("No Anumeha user found.");
  process.exit(1);
}

console.log("Matched users:");
for (const u of userRows) {
  console.log(`  · ${u.display_name ?? ""} <${u.email}> batch=${u.batch_id ?? "(none)"}`);
}

const primary = userRows[0];
const batchId = primary.batch_id;
if (!batchId) {
  console.error(`User ${primary.email} has no batch_id.`);
  process.exit(1);
}

const batchRows = await sql`SELECT id, label FROM batches WHERE id = ${batchId} LIMIT 1`;
const batchLabel = batchRows[0]?.label ?? batchId;
const memberEmails = (
  await sql`SELECT LOWER(email) AS email FROM users WHERE batch_id = ${batchId}`
).map((r) => r.email);

console.log(`\nClearing batch: ${batchLabel} (${batchId})`);
console.log(`Members: ${memberEmails.length} → ${memberEmails.join(", ")}`);

const courseAssignments = await sql`
  SELECT mb.module_id, cm.title
  FROM course_module_batches mb
  INNER JOIN course_modules cm ON cm.id = mb.module_id
  WHERE mb.batch_id = ${batchId}
`;
const complianceAssignments = await sql`
  SELECT mb.module_id, tm.title
  FROM module_batches mb
  INNER JOIN training_modules tm ON tm.id = mb.module_id
  WHERE mb.batch_id = ${batchId}
`;

console.log("\nCourse assignments:");
for (const row of courseAssignments) console.log(`  · ${row.title}`);
if (!courseAssignments.length) console.log("  (none)");
console.log("Compliance assignments:");
for (const row of complianceAssignments) console.log(`  · ${row.title}`);
if (!complianceAssignments.length) console.log("  (none)");

const before = {
  course_assignments: courseAssignments.length,
  compliance_assignments: complianceAssignments.length,
  course_progress: (
    await sql`SELECT COUNT(*)::int AS c FROM course_progress WHERE LOWER(user_email) = ANY(${memberEmails}) OR batch_id = ${batchId}`
  )[0].c,
  assessment_progress: (
    await sql`SELECT COUNT(*)::int AS c FROM assessment_progress WHERE LOWER(user_email) = ANY(${memberEmails}) OR batch_id = ${batchId}`
  )[0].c,
  course_notifications: (
    await sql`SELECT COUNT(*)::int AS c FROM course_notifications WHERE LOWER(user_email) = ANY(${memberEmails})`
  )[0].c,
  training_notifications: (
    await sql`SELECT COUNT(*)::int AS c FROM training_notifications WHERE LOWER(user_email) = ANY(${memberEmails})`
  )[0].c,
  course_reviews: (
    await sql`SELECT COUNT(*)::int AS c FROM course_review_requests WHERE LOWER(username) = ANY(${memberEmails})`
  )[0].c,
  review_requests: (
    await sql`SELECT COUNT(*)::int AS c FROM review_requests WHERE LOWER(username) = ANY(${memberEmails})`
  )[0].c,
  course_feedback: (
    await sql`SELECT COUNT(*)::int AS c FROM course_feedback_entries WHERE LOWER(user_id) = ANY(${memberEmails})`
  )[0].c,
  feedback: (
    await sql`SELECT COUNT(*)::int AS c FROM feedback_entries WHERE LOWER(user_id) = ANY(${memberEmails})`
  )[0].c,
};

// audit logs may or may not have batch_id / user_email — probe columns
const auditCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'course_audit_logs'
`;
const auditColSet = new Set(auditCols.map((c) => c.column_name));
let auditBefore = 0;
if (auditColSet.has("user_email")) {
  auditBefore = (
    await sql`SELECT COUNT(*)::int AS c FROM course_audit_logs WHERE LOWER(user_email) = ANY(${memberEmails})`
  )[0].c;
} else if (auditColSet.has("batch_id")) {
  auditBefore = (
    await sql`SELECT COUNT(*)::int AS c FROM course_audit_logs WHERE batch_id = ${batchId}`
  )[0].c;
}
before.course_audit = auditBefore;

console.log("\nBEFORE:", before);

if (dryRun) {
  console.log("\n[dry-run] No changes written.");
  await sql.end();
  process.exit(0);
}

const removedCourseBatches = await sql`
  DELETE FROM course_module_batches WHERE batch_id = ${batchId} RETURNING module_id
`;
const removedComplianceBatches = await sql`
  DELETE FROM module_batches WHERE batch_id = ${batchId} RETURNING module_id
`;
const courseProgress = await sql`
  DELETE FROM course_progress
  WHERE LOWER(user_email) = ANY(${memberEmails}) OR batch_id = ${batchId}
  RETURNING id
`;
const complianceProgress = await sql`
  DELETE FROM assessment_progress
  WHERE LOWER(user_email) = ANY(${memberEmails}) OR batch_id = ${batchId}
  RETURNING id
`;
const courseNotifs = await sql`
  DELETE FROM course_notifications
  WHERE LOWER(user_email) = ANY(${memberEmails})
  RETURNING id
`;
const trainingNotifs = await sql`
  DELETE FROM training_notifications
  WHERE LOWER(user_email) = ANY(${memberEmails})
  RETURNING id
`;
const courseReviews = await sql`
  DELETE FROM course_review_requests
  WHERE LOWER(username) = ANY(${memberEmails})
  RETURNING id
`;
const complianceReviews = await sql`
  DELETE FROM review_requests
  WHERE LOWER(username) = ANY(${memberEmails})
  RETURNING id
`;
const courseFeedback = await sql`
  DELETE FROM course_feedback_entries
  WHERE LOWER(user_id) = ANY(${memberEmails})
  RETURNING id
`;
const complianceFeedback = await sql`
  DELETE FROM feedback_entries
  WHERE LOWER(user_id) = ANY(${memberEmails})
  RETURNING id
`;

let courseAudit = [];
if (auditColSet.has("user_email")) {
  courseAudit = await sql`
    DELETE FROM course_audit_logs
    WHERE LOWER(user_email) = ANY(${memberEmails})
    RETURNING id
  `;
} else if (auditColSet.has("batch_id")) {
  courseAudit = await sql`
    DELETE FROM course_audit_logs
    WHERE batch_id = ${batchId}
    RETURNING id
  `;
}

console.log("\nCleared:");
console.log(`  course_module_batches: ${removedCourseBatches.length}`);
console.log(`  module_batches: ${removedComplianceBatches.length}`);
console.log(`  course_progress: ${courseProgress.length}`);
console.log(`  assessment_progress: ${complianceProgress.length}`);
console.log(`  course_notifications: ${courseNotifs.length}`);
console.log(`  training_notifications: ${trainingNotifs.length}`);
console.log(`  course_review_requests: ${courseReviews.length}`);
console.log(`  review_requests: ${complianceReviews.length}`);
console.log(`  course_feedback_entries: ${courseFeedback.length}`);
console.log(`  feedback_entries: ${complianceFeedback.length}`);
console.log(`  course_audit_logs: ${courseAudit.length}`);
console.log(`\n✅ Batch "${batchLabel}" is clear for retesting.`);

await sql.end();

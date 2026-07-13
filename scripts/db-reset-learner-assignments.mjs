/**
 * Clear all bundle assignments and learner state for one user so bundles can be re-assigned.
 *
 * Usage:
 *   node scripts/db-reset-learner-assignments.mjs arya.chaudhari@relanto.ai
 *   node scripts/db-reset-learner-assignments.mjs arya.chaudhari@relanto.ai --dry-run
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

const email = (process.argv[2] ?? "").trim().toLowerCase();
const dryRun = process.argv.includes("--dry-run");

if (!email) {
  console.error("Usage: node scripts/db-reset-learner-assignments.mjs <email> [--dry-run]");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const userRows = await sql`
  SELECT email, display_name, batch_id FROM users WHERE LOWER(email) = ${email} LIMIT 1
`;
if (userRows.length === 0) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

const user = userRows[0];
const batchIds = new Set(user.batch_id ? [user.batch_id] : []);

const progressBatches = await sql`
  SELECT DISTINCT batch_id FROM course_progress WHERE LOWER(user_email) = ${email}
  UNION
  SELECT DISTINCT batch_id FROM assessment_progress WHERE LOWER(user_email) = ${email}
`;
for (const row of progressBatches) {
  if (row.batch_id) batchIds.add(row.batch_id);
}

console.log(`Resetting assignments for ${user.display_name ?? email} (${email})`);
console.log(`Batches: ${[...batchIds].join(", ") || "(none)"}`);

const courseAssignments = await sql`
  SELECT mb.module_id, cm.title, mb.batch_id
  FROM course_module_batches mb
  INNER JOIN course_modules cm ON cm.id = mb.module_id
  WHERE mb.batch_id = ANY(${[...batchIds]})
`;
const complianceAssignments = await sql`
  SELECT mb.module_id, tm.title, mb.batch_id
  FROM module_batches mb
  INNER JOIN training_modules tm ON tm.id = mb.module_id
  WHERE mb.batch_id = ANY(${[...batchIds]})
`;

console.log("\nCourse bundle assignments to remove:");
for (const row of courseAssignments) {
  console.log(`  · ${row.title} (${row.module_id}) → batch ${row.batch_id}`);
}
console.log("\nCompliance assignments to remove:");
for (const row of complianceAssignments) {
  console.log(`  · ${row.title} (${row.module_id}) → batch ${row.batch_id}`);
}

if (dryRun) {
  console.log("\n[dry-run] No changes written.");
  await sql.end();
  process.exit(0);
}

const removedCourseBatches = await sql`
  DELETE FROM course_module_batches
  WHERE batch_id = ANY(${[...batchIds]})
  RETURNING module_id, batch_id
`;
const removedComplianceBatches = await sql`
  DELETE FROM module_batches
  WHERE batch_id = ANY(${[...batchIds]})
  RETURNING module_id, batch_id
`;

const courseProgress = await sql`
  DELETE FROM course_progress WHERE LOWER(user_email) = ${email} RETURNING module_id, status
`;
const complianceProgress = await sql`
  DELETE FROM assessment_progress WHERE LOWER(user_email) = ${email} RETURNING module_id, status
`;
const courseReviews = await sql`
  DELETE FROM course_review_requests WHERE LOWER(username) = ${email} RETURNING id
`;
const complianceReviews = await sql`
  DELETE FROM review_requests WHERE LOWER(username) = ${email} RETURNING id
`;
const courseNotifications = await sql`
  DELETE FROM course_notifications WHERE LOWER(user_email) = ${email} RETURNING module_id, notification_type
`;
const complianceNotifications = await sql`
  DELETE FROM training_notifications WHERE LOWER(user_email) = ${email} RETURNING module_id, notification_type
`;
const courseFeedback = await sql`
  DELETE FROM course_feedback_entries WHERE LOWER(user_id) = ${email} RETURNING id
`;
const complianceFeedback = await sql`
  DELETE FROM feedback_entries WHERE LOWER(user_id) = ${email} RETURNING id
`;

console.log(`\n✅ Removed ${removedCourseBatches.length} course batch assignment(s).`);
console.log(`✅ Removed ${removedComplianceBatches.length} compliance batch assignment(s).`);
console.log(`✅ Cleared ${courseProgress.length} course progress row(s).`);
console.log(`✅ Cleared ${complianceProgress.length} compliance progress row(s).`);
console.log(`✅ Cleared ${courseReviews.length + complianceReviews.length} review(s).`);
console.log(
  `✅ Cleared ${courseNotifications.length + complianceNotifications.length} notification(s).`,
);
console.log(`✅ Cleared ${courseFeedback.length + complianceFeedback.length} feedback row(s).`);
console.log("\nNext: Admin → Content Library → assign bundle to Arya's batch again.");
console.log("Learner should hard-refresh or clear site data before retesting.");

await sql.end();

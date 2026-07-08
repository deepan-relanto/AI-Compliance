/**
 * Keep the newest course bundle, remove other course modules,
 * and clear batch assignments + invite history + progress on the kept module
 * so it can be republished and emails will send again.
 *
 * Usage: node scripts/db-reset-course-assignments.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

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
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(url);

const courses = await sql`
  SELECT id, title, created_at, mcq_generation_status
  FROM training_modules
  WHERE module_kind = 'course'
  ORDER BY created_at DESC
`;

if (courses.length === 0) {
  console.log("No course bundles found. Nothing to reset.");
  process.exit(0);
}

const keep = courses[0];
const removeIds = courses.slice(1).map((c) => c.id);

console.log(`Keeping course: ${keep.id}`);
console.log(`  title: ${keep.title}`);
console.log(`  status: ${keep.mcq_generation_status}`);
console.log(`Removing ${removeIds.length} other course module(s)…`);

if (removeIds.length > 0) {
  for (const id of removeIds) {
    await sql`DELETE FROM training_modules WHERE id = ${id}`;
    console.log(`  deleted ${id}`);
  }
}

const assigned = await sql`
  DELETE FROM module_batches WHERE module_id = ${keep.id} RETURNING batch_id
`;
const invites = await sql`
  DELETE FROM training_notifications
  WHERE module_id = ${keep.id} AND notification_type = 'invited'
  RETURNING user_email
`;
const progress = await sql`
  DELETE FROM assessment_progress WHERE module_id = ${keep.id} RETURNING user_email
`;

await sql`
  UPDATE training_modules
  SET updated_at = NOW()
  WHERE id = ${keep.id}
`;

console.log(`Cleared ${assigned.length} batch assignment(s).`);
console.log(`Cleared ${invites.length} invite notification(s).`);
console.log(`Cleared ${progress.length} progress row(s).`);
console.log("Kept module still has its content; status stays ready for republish.");
console.log("\nNext: Content Library → Courses → Reuse bundle → Assign & email");
console.log("(or republish the same module to a batch — invitation emails send on assign).");

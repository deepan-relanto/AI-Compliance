/**
 * Reset one learner's progress, reviews, and notifications in the DB.
 * Usage: node scripts/db-reset-user-progress.mjs [email]
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

const email = (process.argv[2] ?? "shreyas.shankar@relanto.ai").trim().toLowerCase();
const sql = neon(url);

console.log(`🧹 Resetting DB progress for ${email}…\n`);

const progress = await sql`
  DELETE FROM assessment_progress
  WHERE LOWER(user_email) = ${email}
  RETURNING module_id, module_title, status
`;
console.log(`  · assessment_progress: ${progress.length} row(s)`);

const reviews = await sql`
  DELETE FROM review_requests
  WHERE LOWER(username) = ${email}
  RETURNING id
`;
console.log(`  · review_requests: ${reviews.length} row(s)`);

const notifications = await sql`
  DELETE FROM training_notifications
  WHERE LOWER(user_email) = ${email}
  RETURNING id
`;
console.log(`  · training_notifications: ${notifications.length} row(s)`);

const feedback = await sql`
  DELETE FROM feedback_entries
  WHERE LOWER(user_id) = ${email}
  RETURNING id
`;
console.log(`  · feedback_entries: ${feedback.length} row(s)`);

console.log("\n✅ Done. Learner must hard-refresh the browser to clear localStorage.");

/**
 * Full wipe of all app data except users (logins) and batches.
 * Clears modules, MCQs, progress, feedback, monitoring, uploads, audit logs.
 *
 * Usage: npm run db:clear-all
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync, unlinkSync } from "node:fs";
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

console.log("🧹 Clearing ALL app data (keeping users + batches)…\n");

const tables = [
  ["training_notifications", await sql`DELETE FROM training_notifications RETURNING id`],
  ["assessment_progress", await sql`DELETE FROM assessment_progress RETURNING id`],
  ["feedback_entries", await sql`DELETE FROM feedback_entries RETURNING id`],
  ["review_requests", await sql`DELETE FROM review_requests RETURNING id`],
  ["audit_logs", await sql`DELETE FROM audit_logs RETURNING id`],
  ["live_sessions", await sql`DELETE FROM live_sessions RETURNING id`],
  ["mcq_options", await sql`DELETE FROM mcq_options RETURNING question_id`],
  ["mcq_questions", await sql`DELETE FROM mcq_questions RETURNING id`],
  ["module_batches", await sql`DELETE FROM module_batches RETURNING module_id`],
  ["upload_files", await sql`DELETE FROM upload_files RETURNING id`],
  ["pdf_storage", await sql`DELETE FROM pdf_storage RETURNING filename`],
  ["training_modules", await sql`DELETE FROM training_modules RETURNING id`],
];

for (const [name, rows] of tables) {
  console.log(`  · ${name}: ${rows.length} row(s) removed`);
}

await sql`
  UPDATE batches
  SET compliance = 0, pass_rate = 0, fail_rate = 0, active_sessions = 0,
      updated_at = NOW()
`;
console.log("  · batches: compliance counters reset");

const uploadsDir = join(root, "public", "uploads");
let filesRemoved = 0;
try {
  for (const name of readdirSync(uploadsDir)) {
    if (name.endsWith(".pdf") || name.endsWith(".ppt") || name.endsWith(".pptx")) {
      unlinkSync(join(uploadsDir, name));
      filesRemoved++;
      console.log(`  · removed public/uploads/${name}`);
    }
  }
} catch {
  console.log("  · public/uploads: (empty or missing)");
}

if (filesRemoved === 0) {
  console.log("  · public/uploads: no PDF/PPT files to remove");
}

console.log("\n✅ Everything cleared.");
console.log("   Kept: users (logins) + batches");
console.log("   Tip: hard-refresh the browser (Ctrl+Shift+R) to clear cached local data.");

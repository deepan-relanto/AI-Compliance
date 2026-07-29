/**
 * Clears all training content for a fresh test (keeps users + batches).
 * Usage:
 *   npm run db:clear-modules -- --dry-run
 *   npm run db:clear-modules -- --confirm
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync, unlinkSync } from "node:fs";
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

const { dryRun } = requireDestructiveConfirm("db-clear-modules.mjs", {
  description: "Clears training modules, MCQs, progress, and uploads (keeps users + batches).",
});

const sql = neon(url);

console.log("Clearing training modules, MCQs, progress, uploads…");

const uploadsDir = join(root, "public", "uploads");

if (dryRun) {
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM training_notifications) AS training_notifications,
      (SELECT COUNT(*)::int FROM assessment_progress) AS assessment_progress,
      (SELECT COUNT(*)::int FROM feedback_entries) AS feedback_entries,
      (SELECT COUNT(*)::int FROM review_requests) AS review_requests,
      (SELECT COUNT(*)::int FROM audit_logs) AS audit_logs,
      (SELECT COUNT(*)::int FROM live_sessions) AS live_sessions,
      (SELECT COUNT(*)::int FROM mcq_options) AS mcq_options,
      (SELECT COUNT(*)::int FROM mcq_questions) AS mcq_questions,
      (SELECT COUNT(*)::int FROM module_batches) AS module_batches,
      (SELECT COUNT(*)::int FROM upload_files) AS upload_files,
      (SELECT COUNT(*)::int FROM pdf_storage) AS pdf_storage,
      (SELECT COUNT(*)::int FROM training_modules) AS training_modules,
      (SELECT COUNT(*)::int FROM batches) AS batches
  `;
  const c = counts[0];
  console.log("[dry-run] Would delete from database:");
  for (const [name, n] of Object.entries(c)) {
    console.log(`  · ${name}: ${n} row(s)`);
  }
  let uploadCount = 0;
  try {
    for (const name of readdirSync(uploadsDir)) {
      if (name.endsWith(".pdf") || name.endsWith(".ppt") || name.endsWith(".pptx")) {
        uploadCount++;
        console.log(`  · would remove public/uploads/${name}`);
      }
    }
  } catch {
    console.log("  · public/uploads: (empty or missing)");
  }
  if (uploadCount === 0) {
    console.log("  · public/uploads: no PDF/PPT files to remove");
  }
  console.log("\nNo changes written. Pass --confirm to execute.");
  process.exit(0);
}

await sql`DELETE FROM training_notifications`;
await sql`DELETE FROM assessment_progress`;
await sql`DELETE FROM feedback_entries`;
await sql`DELETE FROM review_requests`;
await sql`DELETE FROM audit_logs`;
await sql`DELETE FROM live_sessions`;
await sql`DELETE FROM mcq_options`;
await sql`DELETE FROM mcq_questions`;
await sql`DELETE FROM module_batches`;
await sql`DELETE FROM upload_files`;
await sql`DELETE FROM pdf_storage`;
await sql`DELETE FROM training_modules`;

await sql`
  UPDATE batches
  SET compliance = 0, pass_rate = 0, fail_rate = 0, active_sessions = 0,
      updated_at = NOW()
`;

try {
  for (const name of readdirSync(uploadsDir)) {
    if (name.endsWith(".pdf") || name.endsWith(".ppt") || name.endsWith(".pptx")) {
      unlinkSync(join(uploadsDir, name));
      console.log(`  Removed public/uploads/${name}`);
    }
  }
} catch {
  console.log("  (no uploads folder or empty)");
}

console.log("✅ Content cleared. Users and batches are unchanged.");

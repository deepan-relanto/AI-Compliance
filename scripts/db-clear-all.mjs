/**
 * Full wipe of all app data except users (logins) and batches.
 * Clears modules, MCQs, progress, feedback, monitoring, uploads, audit logs.
 *
 * Usage:
 *   npm run db:clear-all -- --dry-run
 *   npm run db:clear-all -- --confirm
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

const { dryRun } = requireDestructiveConfirm("db-clear-all.mjs", {
  description: "Full wipe of app data except users and employees.",
});

const sql = neon(url);

console.log("🧹 Clearing ALL app data (keeping users + employees)…\n");

const uploadsDir = join(root, "public", "uploads");
const courseAssetsDir = join(root, "public", "course-assets");

function listUploadFiles(dir, extensions) {
  try {
    return readdirSync(dir).filter((name) => extensions.some((ext) => name.endsWith(ext)));
  } catch {
    return [];
  }
}

function listCourseAssetFiles() {
  try {
    return readdirSync(courseAssetsDir).filter((name) => name !== ".gitkeep");
  } catch {
    return [];
  }
}

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
  const uploadFiles = listUploadFiles(uploadsDir, [".pdf", ".ppt", ".pptx"]);
  console.log(`  · public/uploads: ${uploadFiles.length} PDF/PPT file(s)`);
  for (const name of uploadFiles) console.log(`      - ${name}`);
  const assetFiles = listCourseAssetFiles();
  console.log(`  · public/course-assets: ${assetFiles.length} file(s)`);
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
  ["mcq_options", await sql`DELETE FROM mcq_options RETURNING question_id`],
  ["mcq_questions", await sql`DELETE FROM mcq_questions RETURNING id`],
  ["module_batches", await sql`DELETE FROM module_batches RETURNING module_id`],
  ["upload_files", await sql`DELETE FROM upload_files RETURNING id`],
  ["pdf_storage", await sql`DELETE FROM pdf_storage RETURNING filename`],
  ["training_modules", await sql`DELETE FROM training_modules RETURNING id`],
  ["batches", await sql`DELETE FROM batches RETURNING id`],
];

for (const [name, rows] of tables) {
  console.log(`  · ${name}: ${rows.length} row(s) removed`);
}

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

let assetsRemoved = 0;
try {
  for (const name of readdirSync(courseAssetsDir)) {
    if (name !== ".gitkeep") {
      unlinkSync(join(courseAssetsDir, name));
      assetsRemoved++;
      console.log(`  · removed public/course-assets/${name}`);
    }
  }
} catch {
  console.log("  · public/course-assets: (empty or missing)");
}

if (assetsRemoved === 0) {
  console.log("  · public/course-assets: no generated assets to remove");
}

console.log("\n✅ Everything cleared.");
console.log("   Kept: users (logins) + employees");
console.log("   Tip: hard-refresh the browser (Ctrl+Shift+R) to clear cached local data.");

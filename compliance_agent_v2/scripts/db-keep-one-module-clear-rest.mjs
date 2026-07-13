/**
 * Keeps one training module (PDF + MCQs) and clears everything else:
 * batches, assignments, monitoring, and all other modules.
 *
 * Usage:
 *   npm run db:keep-one-module
 *   node scripts/db-keep-one-module-clear-rest.mjs [moduleId]
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

const sql = neon(url);
const requestedModuleId = process.argv[2]?.trim() || null;

console.log("🧹 Keeping one module — clearing batches, assignments, monitoring, and other content…\n");

const modules = requestedModuleId
  ? await sql`
      SELECT id, title, pdf_url, content_hash, created_at
      FROM training_modules
      WHERE id = ${requestedModuleId}
      LIMIT 1
    `
  : await sql`
      SELECT id, title, pdf_url, content_hash, created_at
      FROM training_modules
      ORDER BY created_at ASC
      LIMIT 1
    `;

if (!modules.length) {
  console.error("❌ No training module found to keep.");
  process.exit(1);
}

const keep = modules[0];
console.log(`  · Keeping module: ${keep.title} (${keep.id})`);

const monitoringTables = [
  ["training_notifications", await sql`DELETE FROM training_notifications RETURNING id`],
  ["assessment_progress", await sql`DELETE FROM assessment_progress RETURNING id`],
  ["feedback_entries", await sql`DELETE FROM feedback_entries RETURNING id`],
  ["review_requests", await sql`DELETE FROM review_requests RETURNING id`],
  ["audit_logs", await sql`DELETE FROM audit_logs RETURNING id`],
  ["live_sessions", await sql`DELETE FROM live_sessions RETURNING id`],
  ["module_batches", await sql`DELETE FROM module_batches RETURNING module_id`],
];

for (const [name, rows] of monitoringTables) {
  console.log(`  · ${name}: ${rows.length} row(s) removed`);
}

const users = await sql`
  UPDATE users
  SET batch_id = NULL, updated_at = NOW()
  WHERE batch_id IS NOT NULL
  RETURNING id
`;
console.log(`  · users batch_id cleared: ${users.length} row(s)`);

const batches = await sql`DELETE FROM batches RETURNING id`;
console.log(`  · batches: ${batches.length} row(s) removed`);

const otherModules = await sql`
  DELETE FROM training_modules
  WHERE id <> ${keep.id}
  RETURNING id
`;
console.log(`  · other training_modules: ${otherModules.length} row(s) removed`);

const uploads = await sql`
  DELETE FROM upload_files
  WHERE module_id IS DISTINCT FROM ${keep.id}
  RETURNING id
`;
console.log(`  · other upload_files: ${uploads.length} row(s) removed`);

if (keep.pdf_url) {
  const pdfs = await sql`
    DELETE FROM pdf_storage
    WHERE pdf_url IS DISTINCT FROM ${keep.pdf_url}
    RETURNING filename
  `;
  console.log(`  · other pdf_storage: ${pdfs.length} file(s) removed`);
} else {
  const pdfs = await sql`DELETE FROM pdf_storage RETURNING filename`;
  console.log(`  · pdf_storage (no keep url): ${pdfs.length} file(s) removed`);
}

const kept = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM training_modules) AS modules,
    (SELECT COUNT(*)::int FROM mcq_questions WHERE module_id = ${keep.id}) AS questions,
    (SELECT COUNT(*)::int FROM pdf_storage) AS pdf_files,
    (SELECT COUNT(*)::int FROM batches) AS batches,
    (SELECT COUNT(*)::int FROM module_batches) AS assignments
`;
const stats = kept[0];

console.log("\n✅ Done.");
console.log(`   Kept module: ${keep.title}`);
console.log(
  `   Remaining: ${stats.modules} module(s), ${stats.questions} MCQ(s), ${stats.pdf_files} PDF(s)`,
);
console.log(`   Cleared: ${stats.batches} batch(es), ${stats.assignments} assignment(s)`);
console.log("   Tip: learners should hard-refresh (Ctrl+Shift+R) to clear browser progress cache.");

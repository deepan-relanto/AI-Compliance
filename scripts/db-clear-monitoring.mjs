/**
 * Clears monitoring-related database tables.
 * Usage:
 *   npm run db:clear-monitoring -- --dry-run
 *   npm run db:clear-monitoring -- --confirm
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
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

const { dryRun } = requireDestructiveConfirm("db-clear-monitoring.mjs", {
  description: "Clears monitoring-related database tables.",
});

const sql = neon(url);

console.log("🧹 Clearing monitoring data…");

if (dryRun) {
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM assessment_progress) AS assessment_progress,
      (SELECT COUNT(*)::int FROM review_requests) AS review_requests,
      (SELECT COUNT(*)::int FROM audit_logs) AS audit_logs,
      (SELECT COUNT(*)::int FROM live_sessions) AS live_sessions,
      (SELECT COUNT(*)::int FROM batches) AS batches
  `;
  const c = counts[0];
  console.log("[dry-run] Would delete:");
  console.log(`  · assessment_progress: ${c.assessment_progress} row(s)`);
  console.log(`  · review_requests: ${c.review_requests} row(s)`);
  console.log(`  · audit_logs: ${c.audit_logs} row(s)`);
  console.log(`  · live_sessions: ${c.live_sessions} row(s)`);
  console.log(`  · batches: reset active_sessions on ${c.batches} row(s)`);
  console.log("\nNo changes written. Pass --confirm to execute.");
  process.exit(0);
}

const progress = await sql`DELETE FROM assessment_progress RETURNING id`;
console.log(`  · assessment_progress: ${progress.length} row(s)`);

const reviews = await sql`DELETE FROM review_requests RETURNING id`;
console.log(`  · review_requests: ${reviews.length} row(s)`);

const audit = await sql`DELETE FROM audit_logs RETURNING id`;
console.log(`  · audit_logs: ${audit.length} row(s)`);

const live = await sql`DELETE FROM live_sessions RETURNING id`;
console.log(`  · live_sessions: ${live.length} row(s)`);

await sql`
  UPDATE batches
  SET active_sessions = 0, updated_at = NOW()
`;
console.log("  · batches active_sessions reset");

console.log("\n✅ Monitoring database cleared.");

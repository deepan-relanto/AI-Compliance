/**
 * Clears monitoring-related database tables.
 * Usage: npm run db:clear-monitoring
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

console.log("🧹 Clearing monitoring data…");

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

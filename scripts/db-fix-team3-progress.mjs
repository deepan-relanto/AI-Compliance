/**
 * Move Shreyas + Hridiya progress records to Relanto Team 3.
 * Usage: node scripts/db-fix-team3-progress.mjs
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

const TEAM = "relanto_team_3";
const emails = [
  "hridyalakshmi.santhosh@relanto.ai",
  "shreyas.shankar@relanto.ai",
];

console.log("Updating users + assessment progress → Relanto Team 3…\n");

for (const email of emails) {
  const users = await sql`
    UPDATE users
    SET batch_id = ${TEAM}, updated_at = NOW()
    WHERE LOWER(email) = LOWER(${email})
    RETURNING email, batch_id
  `;
  const progress = await sql`
    UPDATE assessment_progress
    SET batch_id = ${TEAM}, updated_at = NOW()
    WHERE LOWER(user_email) = LOWER(${email})
    RETURNING user_email, batch_id, module_title, status, score_percent
  `;
  console.log(`  ${email}`);
  console.log(`    user: ${users[0]?.batch_id ?? "not found"}`);
  for (const row of progress) {
    console.log(
      `    progress: ${row.module_title} → ${row.batch_id} (${row.status}, ${row.score_percent ?? "—"}%)`,
    );
  }
  if (progress.length === 0) {
    console.log("    progress: (no rows)");
  }
}

console.log("\n✅ Done. Refresh analytics to see Relanto Team 3.");

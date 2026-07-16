import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
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
  console.error("❌ Set DATABASE_URL or postgres_neon in .env");
  process.exit(1);
}

const sqlText = readFileSync(
  join(root, "src", "lib", "db", "schema-course-tts.sql"),
  "utf8",
);

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  await sql.unsafe(sqlText);
  await sql`
    ALTER TABLE tts_course_modules
    ADD COLUMN IF NOT EXISTS tts_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `;
  await sql`
    ALTER TABLE tts_course_modules
    ADD COLUMN IF NOT EXISTS avatar_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `;
  await sql`
    ALTER TABLE tts_course_modules
    ADD COLUMN IF NOT EXISTS script_status TEXT NOT NULL DEFAULT 'not_started'
  `;
  console.log("✅ TTS sandbox tables migrated.");
} catch (err) {
  console.error("❌ Failed to migrate TTS sandbox tables:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

/**
 * Applies src/lib/db/schema.sql to Neon PostgreSQL.
 * Usage: npm run db:migrate
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const envPath = join(root, ".env");
    const raw = readFileSync(envPath, "utf8");
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
    // .env optional if DATABASE_URL already exported
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

const schemaPath = join(root, "src", "lib", "db", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

const sql = postgres(url, { ssl: "require", max: 1 });

console.log("Applying schema to Neon…");

try {
  await sql.unsafe(schema);
  console.log("✅ Migration complete.");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

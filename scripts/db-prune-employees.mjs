/**
 * Remove employees not present in scripts/data/employees-master.csv
 * Usage: npm run db:prune:employees
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

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

const csvPath = join(__dirname, "data", "employees-master.csv");
const raw = readFileSync(csvPath, "utf8");
const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });

const keepEmails = [
  ...new Set(
    parsed.data
      .map((row) => (row["Work Email"] ?? "").trim().toLowerCase())
      .filter(Boolean),
  ),
];

const sql = neon(url);

const stale = await sql`
  SELECT employee_number, name, work_email
  FROM employees
  WHERE LOWER(work_email) <> ALL(${keepEmails}::text[])
  ORDER BY name
`;

if (stale.length === 0) {
  console.log("✅ No stale employees — directory matches master CSV.");
  process.exit(0);
}

console.log(`Removing ${stale.length} employee(s) not in master CSV:`);
for (const row of stale) {
  console.log(`  - ${row.name} (${row.work_email}, #${row.employee_number})`);
}

await sql`
  DELETE FROM employees
  WHERE LOWER(work_email) <> ALL(${keepEmails}::text[])
`;

const total = await sql`SELECT COUNT(*)::int AS c FROM employees`;
console.log(`\n✅ Pruned ${stale.length}. Total employees: ${total[0]?.c ?? 0}`);

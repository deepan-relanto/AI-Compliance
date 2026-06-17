/**
 * Seed master HR roster from scripts/data/employees-master.csv
 * Usage: npm run db:seed:employees
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

function parseHrDate(raw) {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mon = months[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}

function clean(val) {
  const s = (val ?? "").trim();
  if (!s || s.toLowerCase() === "not available" || s.toLowerCase() === "na") return null;
  return s;
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
const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });

if (parsed.errors.length) {
  console.warn("CSV parse warnings:", parsed.errors.slice(0, 3));
}

const sql = neon(url);

console.log(`Seeding ${parsed.data.length} employees from master CSV…`);

let inserted = 0;
let skipped = 0;

for (const row of parsed.data) {
  const employeeNumber = clean(row["Employee Number"]);
  const workEmail = clean(row["Work Email"])?.toLowerCase();
  const name = clean(row.Name);

  if (!employeeNumber || !workEmail || !name) {
    skipped++;
    continue;
  }

  await sql`
    INSERT INTO employees (
      employee_number, name, work_email, date_of_birth, gender, location,
      department, sub_department, job_title, reporting_to, date_joined,
      worker_type, primary_skills, secondary_skills, certifications
    ) VALUES (
      ${employeeNumber},
      ${name},
      ${workEmail},
      ${parseHrDate(row["Date Of Birth"])},
      ${clean(row.Gender)},
      ${clean(row.Location)},
      ${clean(row.Department)},
      ${clean(row["Sub Department"])},
      ${clean(row["Job Title"])},
      ${clean(row["Reporting To"])},
      ${parseHrDate(row["Date Joined"])},
      ${clean(row["Worker Type"])},
      ${clean(row["Primary Skills (IN)"])},
      ${clean(row["Secondary Skills (IN)"])},
      ${clean(row["Certifications (IN)"])}
    )
    ON CONFLICT (employee_number) DO UPDATE SET
      name = EXCLUDED.name,
      work_email = EXCLUDED.work_email,
      date_of_birth = EXCLUDED.date_of_birth,
      gender = EXCLUDED.gender,
      location = EXCLUDED.location,
      department = EXCLUDED.department,
      sub_department = EXCLUDED.sub_department,
      job_title = EXCLUDED.job_title,
      reporting_to = EXCLUDED.reporting_to,
      date_joined = EXCLUDED.date_joined,
      worker_type = EXCLUDED.worker_type,
      primary_skills = EXCLUDED.primary_skills,
      secondary_skills = EXCLUDED.secondary_skills,
      certifications = EXCLUDED.certifications,
      updated_at = NOW()
  `;
  inserted++;
}

const total = await sql`SELECT COUNT(*)::int AS c FROM employees`;
console.log(`\n✅ Employees seeded: ${inserted} upserted, ${skipped} skipped.`);
console.log(`   Total in directory: ${total[0]?.c ?? 0}`);

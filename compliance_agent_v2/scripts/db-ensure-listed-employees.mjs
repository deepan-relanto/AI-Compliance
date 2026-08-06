/**
 * Ensure the listed Relanto people exist in employees (admin search) + users.
 * Pulls rows from scripts/data/employees-master.csv.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function clean(val) {
  const s = (val ?? "").trim();
  if (!s || s.toLowerCase() === "not available" || s.toLowerCase() === "na") return null;
  return s;
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

loadEnv();
const sql = neon(process.env.DATABASE_URL);
const SSO_PLACEHOLDER = "microsoft-sso";

const TARGET_EMAILS = new Set(
  [
    "ynayak@relanto.ai",
    "rajan@relanto.ai",
    "venkatesh@relanto.ai",
    "schowhan@relanto.ai",
    "santhi@relanto.ai",
    "raamanathan.gururajan@relanto.ai",
    "pooja.pura@relanto.ai",
    "prasanna.rs@relanto.ai",
    "vincent@relanto.ai",
  ].map((e) => e.toLowerCase()),
);

const csvPath = join(__dirname, "data", "employees-master.csv");
const parsed = Papa.parse(readFileSync(csvPath, "utf8"), {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
});

const rows = parsed.data.filter((r) =>
  TARGET_EMAILS.has(String(r["Work Email"] ?? "").trim().toLowerCase()),
);

console.log("CSV matches for target emails:", rows.length);
if (rows.length === 0) {
  console.log("Headers sample:", Object.keys(parsed.data[0] ?? {}));
}

for (const row of rows) {
  const email = clean(row["Work Email"])?.toLowerCase();
  const employeeNumber = clean(row["Employee Number"]);
  const name = clean(row.Name);
  if (!email || !employeeNumber || !name) {
    console.log("SKIP incomplete CSV row", { email, employeeNumber, name });
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
      ${email},
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

  await sql`
    INSERT INTO users (email, password_hash, role, batch_id, display_name)
    VALUES (${email}, ${SSO_PLACEHOLDER}, 'user', NULL, ${name})
    ON CONFLICT (email) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
  `;

  console.log("UPSERTED employee+user:", name, `<${email}>`, `#${employeeNumber}`);
}

const check = await sql`
  SELECT e.name, e.work_email, u.display_name, u.batch_id
  FROM employees e
  LEFT JOIN users u ON LOWER(u.email) = LOWER(e.work_email)
  WHERE LOWER(e.work_email) = ANY(${[...TARGET_EMAILS]})
  ORDER BY e.name
`;
console.log("\n=== SEARCHABLE IN ADMIN NOW ===");
console.log(JSON.stringify(check, null, 2));

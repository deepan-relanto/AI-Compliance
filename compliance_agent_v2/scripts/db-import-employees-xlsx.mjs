/**
 * Import HR roster from an Excel (.xlsx) file into employees.
 * Upserts by work email (no duplicate people); falls back to employee_number.
 *
 * Usage:
 *   npm run db:import:employees -- "C:\path\to\file.xlsx"
 */
import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

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
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const utcDays = Math.floor(raw - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
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
  const s = String(val ?? "").trim();
  if (!s || s.toLowerCase() === "not available" || s.toLowerCase() === "na") return null;
  return s;
}

function normalizeEmployeeNumber(val) {
  const s = clean(val);
  if (!s) return null;
  return s.replace(/\.0+$/, "");
}

function mapRow(row) {
  const employeeNumber = normalizeEmployeeNumber(
    row["Employee Number"] ?? row["employee_number"] ?? row["Employee number"],
  );
  const name = clean(row["Full Name"] ?? row.Name ?? row.name);
  const workEmail = clean(row["Work Email"] ?? row.work_email)?.toLowerCase();

  return {
    employeeNumber,
    name,
    workEmail,
    dateOfBirth: parseHrDate(row["Date Of Birth"] ?? row.date_of_birth),
    gender: clean(row.Gender ?? row.gender),
    location: clean(row.Location ?? row.location),
    department: clean(row.Department ?? row.department),
    subDepartment: clean(row["Sub Department"] ?? row.sub_department),
    jobTitle: clean(row["Job Title"] ?? row.job_title),
    reportingTo: clean(row["Reporting To"] ?? row.reporting_to),
    dateJoined: parseHrDate(row["Date Joined"] ?? row.date_joined),
    workerType: clean(row["Worker Type"] ?? row.worker_type),
    primarySkills: clean(row["Primary Skills (IN)"] ?? row.primary_skills),
    secondarySkills: clean(row["Secondary Skills (IN)"] ?? row.secondary_skills),
    certifications: clean(row["Certifications (IN)"] ?? row.certifications),
  };
}

async function upsertEmployee(sql, record) {
  await sql`
    INSERT INTO employees (
      employee_number, name, work_email, date_of_birth, gender, location,
      department, sub_department, job_title, reporting_to, date_joined,
      worker_type, primary_skills, secondary_skills, certifications
    ) VALUES (
      ${record.employeeNumber},
      ${record.name},
      ${record.workEmail},
      ${record.dateOfBirth},
      ${record.gender},
      ${record.location},
      ${record.department},
      ${record.subDepartment},
      ${record.jobTitle},
      ${record.reportingTo},
      ${record.dateJoined},
      ${record.workerType},
      ${record.primarySkills},
      ${record.secondarySkills},
      ${record.certifications}
    )
    ON CONFLICT (employee_number) DO UPDATE SET
      name = EXCLUDED.name,
      work_email = EXCLUDED.work_email,
      date_of_birth = COALESCE(EXCLUDED.date_of_birth, employees.date_of_birth),
      gender = COALESCE(EXCLUDED.gender, employees.gender),
      location = EXCLUDED.location,
      department = EXCLUDED.department,
      sub_department = EXCLUDED.sub_department,
      job_title = EXCLUDED.job_title,
      reporting_to = EXCLUDED.reporting_to,
      date_joined = COALESCE(EXCLUDED.date_joined, employees.date_joined),
      worker_type = COALESCE(EXCLUDED.worker_type, employees.worker_type),
      primary_skills = COALESCE(EXCLUDED.primary_skills, employees.primary_skills),
      secondary_skills = COALESCE(EXCLUDED.secondary_skills, employees.secondary_skills),
      certifications = COALESCE(EXCLUDED.certifications, employees.certifications),
      updated_at = NOW()
  `;
}

loadEnv();

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("❌ Pass the Excel file path: npm run db:import:employees -- \"path\\to\\file.xlsx\"");
  process.exit(1);
}

const filePath = resolve(fileArg);
if (!existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("❌ Set DATABASE_URL in .env");
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const byEmail = new Map();
let skippedInvalid = 0;
for (const raw of rawRows) {
  const record = mapRow(raw);
  if (!record.employeeNumber || !record.workEmail || !record.name) {
    skippedInvalid++;
    continue;
  }
  byEmail.set(record.workEmail, record);
}

const rows = [...byEmail.values()];
const sql = neon(url);

console.log(`Importing ${rows.length} unique employees from ${filePath}…`);
console.log(`  (${rawRows.length} sheet rows, ${skippedInvalid} invalid, ${rawRows.length - rows.length - skippedInvalid} duplicate emails in file)`);

const existingRows = await sql`
  SELECT id, employee_number, LOWER(work_email) AS email
  FROM employees
`;
const existingByEmail = new Map(
  existingRows.map((r) => [r.email, { id: r.id, employeeNumber: r.employee_number }]),
);
const existingByNumber = new Map(
  existingRows.map((r) => [r.employee_number, { id: r.id, email: r.email }]),
);

let inserted = 0;
let updated = 0;
let skippedConflict = 0;

for (const record of rows) {
  const emailHit = existingByEmail.get(record.workEmail);
  const numberHit = existingByNumber.get(record.employeeNumber);

  if (emailHit) {
    await sql`
      UPDATE employees SET
        employee_number = ${record.employeeNumber},
        name = ${record.name},
        work_email = ${record.workEmail},
        date_of_birth = COALESCE(${record.dateOfBirth}, date_of_birth),
        gender = COALESCE(${record.gender}, gender),
        location = ${record.location},
        department = ${record.department},
        sub_department = ${record.subDepartment},
        job_title = ${record.jobTitle},
        reporting_to = ${record.reportingTo},
        date_joined = COALESCE(${record.dateJoined}, date_joined),
        worker_type = COALESCE(${record.workerType}, worker_type),
        primary_skills = COALESCE(${record.primarySkills}, primary_skills),
        secondary_skills = COALESCE(${record.secondarySkills}, secondary_skills),
        certifications = COALESCE(${record.certifications}, certifications),
        updated_at = NOW()
      WHERE id = ${emailHit.id}
    `;
    if (emailHit.employeeNumber !== record.employeeNumber) {
      existingByNumber.delete(emailHit.employeeNumber);
      existingByNumber.set(record.employeeNumber, { id: emailHit.id, email: record.workEmail });
    }
    existingByEmail.set(record.workEmail, { id: emailHit.id, employeeNumber: record.employeeNumber });
    updated++;
    continue;
  }

  if (numberHit && numberHit.email !== record.workEmail) {
    skippedConflict++;
    continue;
  }

  await upsertEmployee(sql, record);
  const newRows = await sql`
    SELECT id FROM employees WHERE employee_number = ${record.employeeNumber} LIMIT 1
  `;
  const id = newRows[0]?.id;
  if (id) {
    existingByEmail.set(record.workEmail, { id, employeeNumber: record.employeeNumber });
    existingByNumber.set(record.employeeNumber, { id, email: record.workEmail });
  }
  if (numberHit) updated++;
  else inserted++;
}

const facets = await Promise.all([
  sql`SELECT COUNT(*)::int AS c FROM employees`,
  sql`SELECT COUNT(DISTINCT location)::int AS c FROM employees WHERE location IS NOT NULL AND btrim(location) <> ''`,
  sql`SELECT COUNT(DISTINCT department)::int AS c FROM employees WHERE department IS NOT NULL AND btrim(department) <> ''`,
]);

console.log(`\n✅ Import complete:`);
console.log(`   ${inserted} new, ${updated} updated, ${skippedConflict} skipped (employee # taken by another email)`);
console.log(`   Total employees: ${facets[0][0]?.c ?? 0}`);
console.log(`   Distinct locations: ${facets[1][0]?.c ?? 0}`);
console.log(`   Distinct departments: ${facets[2][0]?.c ?? 0}`);

const csvOut = join(__dirname, "data", "employees-master.csv");
const csvRows = [
  [
    "Employee Number", "Name", "Work Email", "Date Of Birth", "Gender", "Location",
    "Department", "Sub Department", "Job Title", "Reporting To", "Date Joined",
    "Worker Type", "Primary Skills (IN)", "Secondary Skills (IN)", "Certifications (IN)",
  ],
  ...rows.map((r) => [
    r.employeeNumber, r.name, r.workEmail, r.dateOfBirth ?? "", r.gender ?? "",
    r.location ?? "", r.department ?? "", r.subDepartment ?? "", r.jobTitle ?? "",
    r.reportingTo ?? "", r.dateJoined ?? "", r.workerType ?? "",
    r.primarySkills ?? "", r.secondarySkills ?? "", r.certifications ?? "",
  ]),
];
const csvBody = csvRows
  .map((line) =>
    line
      .map((cell) => {
        const s = String(cell ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(","),
  )
  .join("\n");
writeFileSync(csvOut, `${csvBody}\n`, "utf8");
console.log(`   Master CSV refreshed: ${csvOut}`);

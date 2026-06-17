import type { getSql } from "@/lib/db";
import type {
  EmployeeFacets,
  EmployeeFilterParams,
  EmployeeListResult,
  EmployeeRecord,
} from "@/lib/employee-types";

type Sql = ReturnType<typeof getSql>;

function mapRow(r: Record<string, unknown>): EmployeeRecord {
  return {
    id: r.id as string,
    employeeNumber: r.employee_number as string,
    name: r.name as string,
    workEmail: r.work_email as string,
    dateOfBirth: (r.date_of_birth as string) ?? null,
    gender: (r.gender as string) ?? null,
    location: (r.location as string) ?? null,
    department: (r.department as string) ?? null,
    subDepartment: (r.sub_department as string) ?? null,
    jobTitle: (r.job_title as string) ?? null,
    reportingTo: (r.reporting_to as string) ?? null,
    dateJoined: (r.date_joined as string) ?? null,
    workerType: (r.worker_type as string) ?? null,
    batchId: (r.batch_id as string) ?? null,
    batchLabel: (r.batch_label as string) ?? null,
  };
}

export async function listEmployees(
  sql: Sql,
  params: EmployeeFilterParams,
): Promise<EmployeeListResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(10, params.limit ?? 50));
  const offset = (page - 1) * limit;
  const search = params.search?.trim().toLowerCase() ?? "";
  const searchPattern = search ? `%${search}%` : null;
  const departments = params.departments?.length ? params.departments : null;
  const locations = params.locations?.length ? params.locations : null;
  const genders = params.genders?.length ? params.genders : null;
  const jobTitles = params.jobTitles?.length ? params.jobTitles : null;
  const workerTypes = params.workerTypes?.length ? params.workerTypes : null;
  const dateFrom = params.dateJoinedFrom ?? null;
  const dateTo = params.dateJoinedTo ?? null;
  const unassignedOnly = params.unassignedOnly ?? false;

  const countRows = await sql`
    SELECT COUNT(*)::int AS total
    FROM employees e
    LEFT JOIN users u ON LOWER(u.email) = LOWER(e.work_email)
    WHERE
      (${searchPattern}::text IS NULL OR (
        LOWER(e.name) LIKE ${searchPattern}
        OR LOWER(e.work_email) LIKE ${searchPattern}
        OR LOWER(e.employee_number) LIKE ${searchPattern}
        OR LOWER(COALESCE(e.job_title, '')) LIKE ${searchPattern}
      ))
      AND (${departments}::text[] IS NULL OR e.department = ANY(${departments}))
      AND (${locations}::text[] IS NULL OR e.location = ANY(${locations}))
      AND (${genders}::text[] IS NULL OR e.gender = ANY(${genders}))
      AND (${jobTitles}::text[] IS NULL OR e.job_title = ANY(${jobTitles}))
      AND (${workerTypes}::text[] IS NULL OR e.worker_type = ANY(${workerTypes}))
      AND (${dateFrom}::date IS NULL OR e.date_joined >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR e.date_joined <= ${dateTo}::date)
      AND (${unassignedOnly}::boolean IS FALSE OR u.batch_id IS NULL)
  `;
  const total = Number(countRows[0]?.total ?? 0);

  const rows = await sql`
    SELECT
      e.id, e.employee_number, e.name, e.work_email,
      e.date_of_birth::text, e.gender, e.location, e.department,
      e.sub_department, e.job_title, e.reporting_to, e.date_joined::text,
      e.worker_type, u.batch_id, b.label AS batch_label
    FROM employees e
    LEFT JOIN users u ON LOWER(u.email) = LOWER(e.work_email)
    LEFT JOIN batches b ON b.id = u.batch_id
    WHERE
      (${searchPattern}::text IS NULL OR (
        LOWER(e.name) LIKE ${searchPattern}
        OR LOWER(e.work_email) LIKE ${searchPattern}
        OR LOWER(e.employee_number) LIKE ${searchPattern}
        OR LOWER(COALESCE(e.job_title, '')) LIKE ${searchPattern}
      ))
      AND (${departments}::text[] IS NULL OR e.department = ANY(${departments}))
      AND (${locations}::text[] IS NULL OR e.location = ANY(${locations}))
      AND (${genders}::text[] IS NULL OR e.gender = ANY(${genders}))
      AND (${jobTitles}::text[] IS NULL OR e.job_title = ANY(${jobTitles}))
      AND (${workerTypes}::text[] IS NULL OR e.worker_type = ANY(${workerTypes}))
      AND (${dateFrom}::date IS NULL OR e.date_joined >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR e.date_joined <= ${dateTo}::date)
      AND (${unassignedOnly}::boolean IS FALSE OR u.batch_id IS NULL)
    ORDER BY e.name
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    employees: rows.map((r) => mapRow(r as Record<string, unknown>)),
    total,
    page,
    limit,
  };
}

export async function getEmployeeFacets(sql: Sql): Promise<EmployeeFacets> {
  const [depts, locs, genders, titles, types, range] = await Promise.all([
    sql`SELECT DISTINCT department AS v FROM employees WHERE department IS NOT NULL AND btrim(department) <> '' ORDER BY v`,
    sql`SELECT DISTINCT location AS v FROM employees WHERE location IS NOT NULL AND btrim(location) <> '' ORDER BY v`,
    sql`SELECT DISTINCT gender AS v FROM employees WHERE gender IS NOT NULL AND btrim(gender) <> '' ORDER BY v`,
    sql`SELECT DISTINCT job_title AS v FROM employees WHERE job_title IS NOT NULL AND btrim(job_title) <> '' ORDER BY v`,
    sql`SELECT DISTINCT worker_type AS v FROM employees WHERE worker_type IS NOT NULL AND btrim(worker_type) <> '' ORDER BY v`,
    sql`SELECT MIN(date_joined)::text AS min_d, MAX(date_joined)::text AS max_d FROM employees WHERE date_joined IS NOT NULL`,
  ]);

  const pick = (rows: { v: string }[]) => rows.map((r) => r.v).filter(Boolean);

  return {
    departments: pick(depts as { v: string }[]),
    locations: pick(locs as { v: string }[]),
    genders: pick(genders as { v: string }[]),
    jobTitles: pick(titles as { v: string }[]),
    workerTypes: pick(types as { v: string }[]),
    dateJoinedMin: (range[0]?.min_d as string) ?? null,
    dateJoinedMax: (range[0]?.max_d as string) ?? null,
  };
}

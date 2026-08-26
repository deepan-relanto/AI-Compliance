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
    isAdmin: Boolean(r.is_admin),
  };
}

export async function listEmployees(
  sql: Sql,
  params: EmployeeFilterParams,
): Promise<EmployeeListResult> {
  const fetchAll = params.all === true;
  const page = Math.max(1, params.page ?? 1);
  const limit = fetchAll ? 5000 : Math.min(100, Math.max(10, params.limit ?? 50));
  const offset = fetchAll ? 0 : (page - 1) * limit;
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
    WITH hr AS (
      SELECT e.id::text AS id
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
        AND (${unassignedOnly}::boolean IS FALSE OR (
          u.batch_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_batches ub
            WHERE LOWER(ub.user_email) = LOWER(e.work_email)
          )
        ))
    ),
    admins_only AS (
      SELECT u.id::text AS id
      FROM users u
      WHERE u.role = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM employees e WHERE LOWER(e.work_email) = LOWER(u.email)
        )
        AND (${searchPattern}::text IS NULL OR (
          LOWER(COALESCE(u.display_name, '')) LIKE ${searchPattern}
          OR LOWER(u.email) LIKE ${searchPattern}
        ))
        AND (${departments}::text[] IS NULL OR 'Admin' = ANY(${departments}))
        AND (${locations}::text[] IS NULL)
        AND (${genders}::text[] IS NULL)
        AND (${jobTitles}::text[] IS NULL OR 'Admin' = ANY(${jobTitles}))
        AND (${workerTypes}::text[] IS NULL)
        AND (${dateFrom}::date IS NULL)
        AND (${dateTo}::date IS NULL)
        AND (${unassignedOnly}::boolean IS FALSE OR (
          u.batch_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_batches ub
            WHERE LOWER(ub.user_email) = LOWER(u.email)
          )
        ))
    )
    SELECT COUNT(*)::int AS total FROM (
      SELECT id FROM hr
      UNION ALL
      SELECT id FROM admins_only
    ) directory
  `;
  const total = Number(countRows[0]?.total ?? 0);

  const rows = await sql`
    WITH hr AS (
      SELECT
        e.id::text AS id,
        e.employee_number::text AS employee_number,
        e.name,
        e.work_email,
        e.date_of_birth::text,
        e.gender,
        e.location,
        e.department,
        e.sub_department,
        e.job_title,
        e.reporting_to,
        e.date_joined::text,
        e.worker_type,
        COALESCE(
          u.batch_id,
          (
            SELECT ub.batch_id
            FROM user_batches ub
            WHERE LOWER(ub.user_email) = LOWER(e.work_email)
            ORDER BY ub.created_at ASC
            LIMIT 1
          )
        ) AS batch_id,
        COALESCE(
          b.label,
          (
            SELECT b2.label
            FROM user_batches ub
            INNER JOIN batches b2 ON b2.id = ub.batch_id
            WHERE LOWER(ub.user_email) = LOWER(e.work_email)
            ORDER BY ub.created_at ASC
            LIMIT 1
          )
        ) AS batch_label,
        COALESCE(u.role = 'admin', FALSE) AS is_admin
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
        AND (${unassignedOnly}::boolean IS FALSE OR (
          u.batch_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_batches ub
            WHERE LOWER(ub.user_email) = LOWER(e.work_email)
          )
        ))
    ),
    admins_only AS (
      SELECT
        u.id::text AS id,
        ''::text AS employee_number,
        COALESCE(NULLIF(BTRIM(u.display_name), ''), SPLIT_PART(u.email, '@', 1)) AS name,
        u.email AS work_email,
        NULL::text AS date_of_birth,
        NULL::text AS gender,
        NULL::text AS location,
        'Admin'::text AS department,
        NULL::text AS sub_department,
        'Admin'::text AS job_title,
        NULL::text AS reporting_to,
        NULL::text AS date_joined,
        NULL::text AS worker_type,
        COALESCE(
          u.batch_id,
          (
            SELECT ub.batch_id
            FROM user_batches ub
            WHERE LOWER(ub.user_email) = LOWER(u.email)
            ORDER BY ub.created_at ASC
            LIMIT 1
          )
        ) AS batch_id,
        COALESCE(
          b.label,
          (
            SELECT b2.label
            FROM user_batches ub
            INNER JOIN batches b2 ON b2.id = ub.batch_id
            WHERE LOWER(ub.user_email) = LOWER(u.email)
            ORDER BY ub.created_at ASC
            LIMIT 1
          )
        ) AS batch_label,
        TRUE AS is_admin
      FROM users u
      LEFT JOIN batches b ON b.id = u.batch_id
      WHERE u.role = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM employees e WHERE LOWER(e.work_email) = LOWER(u.email)
        )
        AND (${searchPattern}::text IS NULL OR (
          LOWER(COALESCE(u.display_name, '')) LIKE ${searchPattern}
          OR LOWER(u.email) LIKE ${searchPattern}
        ))
        AND (${departments}::text[] IS NULL OR 'Admin' = ANY(${departments}))
        AND (${locations}::text[] IS NULL)
        AND (${genders}::text[] IS NULL)
        AND (${jobTitles}::text[] IS NULL OR 'Admin' = ANY(${jobTitles}))
        AND (${workerTypes}::text[] IS NULL)
        AND (${dateFrom}::date IS NULL)
        AND (${dateTo}::date IS NULL)
        AND (${unassignedOnly}::boolean IS FALSE OR (
          u.batch_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_batches ub
            WHERE LOWER(ub.user_email) = LOWER(u.email)
          )
        ))
    )
    SELECT * FROM (
      SELECT * FROM hr
      UNION ALL
      SELECT * FROM admins_only
    ) directory
    ORDER BY name
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return {
    employees: rows.map((r) => mapRow(r as Record<string, unknown>)),
    total,
    page: fetchAll ? 1 : page,
    limit: fetchAll ? total : limit,
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
    departments: ["Admin", ...pick(depts as { v: string }[]).filter((v) => v !== "Admin")],
    locations: pick(locs as { v: string }[]),
    genders: pick(genders as { v: string }[]),
    jobTitles: ["Admin", ...pick(titles as { v: string }[]).filter((v) => v !== "Admin")],
    workerTypes: pick(types as { v: string }[]),
    dateJoinedMin: (range[0]?.min_d as string) ?? null,
    dateJoinedMax: (range[0]?.max_d as string) ?? null,
  };
}

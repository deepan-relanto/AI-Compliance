import { requireSessionEmail } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { firstNameFromEmail } from "@/lib/auth-env";
import { mapTrainingModuleRow } from "@/lib/map-training-module";
import { listProgressForUser as listCourseProgressForUser } from "@/lib/services/course-progress-db-service";
import { listProgressForUser as listComplianceProgressForUser } from "@/lib/services/progress-db-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — compliance + course modules and progress for the signed-in learner. */
export async function GET() {
  try {
    const access = await requireSessionEmail(null);
    if (!access.ok) return access.response;

    const sql = getSql();
    const userEmail = access.email;

    const users = await sql`
      SELECT batch_id, display_name, role
      FROM users
      WHERE LOWER(email) = LOWER(${userEmail})
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Account not found." },
        { status: 404 },
      );
    }

    const row = users[0];
    const batchId = (row.batch_id as string | null) ?? "";
    const displayName =
      (row.display_name as string | null)?.trim() || firstNameFromEmail(userEmail);
    const role = row.role as string;

    if (!batchId) {
      const [complianceProgress, courseProgress] = await Promise.all([
        listComplianceProgressForUser(sql, userEmail),
        listCourseProgressForUser(sql, userEmail),
      ]);
      return NextResponse.json({
        ok: true,
        modules: [],
        progress: [...complianceProgress, ...courseProgress],
        batchId: "",
        displayName,
        role,
        email: userEmail,
      });
    }

    const [complianceModuleRows, courseModuleRows, complianceProgress, courseProgress] =
      await Promise.all([
        sql`
          SELECT
            m.*,
            ARRAY_AGG(DISTINCT mb_all.batch_id) FILTER (WHERE mb_all.batch_id IS NOT NULL) AS batch_ids
          FROM training_modules m
          INNER JOIN module_batches mb_filter ON mb_filter.module_id = m.id
          LEFT JOIN module_batches mb_all ON mb_all.module_id = m.id
          WHERE mb_filter.batch_id = ${batchId}
            AND m.mcq_generation_status = 'completed'
            AND COALESCE(m.module_kind, 'compliance') = 'compliance'
          GROUP BY m.id
          ORDER BY m.created_at DESC
        `,
        sql`
          SELECT
            m.*,
            ARRAY_AGG(DISTINCT mb_all.batch_id) FILTER (WHERE mb_all.batch_id IS NOT NULL) AS batch_ids
          FROM course_modules m
          INNER JOIN course_module_batches mb_filter ON mb_filter.module_id = m.id
          LEFT JOIN course_module_batches mb_all ON mb_all.module_id = m.id
          WHERE mb_filter.batch_id = ${batchId}
            AND m.mcq_generation_status = 'completed'
          GROUP BY m.id
          ORDER BY m.created_at DESC
        `,
        listComplianceProgressForUser(sql, userEmail),
        listCourseProgressForUser(sql, userEmail),
      ]);

    const complianceModules = complianceModuleRows.map((moduleRow) =>
      mapTrainingModuleRow(
        moduleRow,
        ((moduleRow.batch_ids as string[] | null) ?? []).filter(Boolean),
      ),
    );

    const courseModules = courseModuleRows.map((moduleRow) =>
      mapTrainingModuleRow(
        { ...moduleRow, module_kind: "course" },
        ((moduleRow.batch_ids as string[] | null) ?? []).filter(Boolean),
      ),
    );

    return NextResponse.json({
      ok: true,
      modules: [...complianceModules, ...courseModules],
      progress: [...complianceProgress, ...courseProgress],
      batchId,
      displayName,
      role,
      email: userEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

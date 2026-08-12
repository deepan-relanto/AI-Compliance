import { requireSessionEmail } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { firstNameFromEmail } from "@/lib/auth-env";
import { mapTrainingModuleRow } from "@/lib/map-training-module";
import { listProgressForUser as listCourseProgressForUser } from "@/lib/services/course-progress-db-service";
import { listProgressForUser as listComplianceProgressForUser } from "@/lib/services/progress-db-service";
import { cachedFetch, CACHE_TTL } from "@/lib/api-cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — compliance + course modules and progress for the signed-in learner. */
export async function GET() {
  try {
    const access = await requireSessionEmail(null);
    if (!access.ok) return access.response;

    const userEmail = access.email;
    const cacheKey = `learner-dashboard:${userEmail.toLowerCase()}`;

    const data = await cachedFetch(cacheKey, CACHE_TTL.learnerDashboard, async () => {
      const sql = getSql();

      const users = await sql`
        SELECT batch_id, display_name, role
        FROM users
        WHERE LOWER(email) = LOWER(${userEmail})
        LIMIT 1
      `;

      if (users.length === 0) {
        return { ok: false as const, error: "Account not found.", status: 404 };
      }

      const row = users[0];
      const primaryBatchId = (row.batch_id as string | null) ?? "";
      const displayName =
        (row.display_name as string | null)?.trim() || firstNameFromEmail(userEmail);
      const role = row.role as string;

      const membershipRows = await sql`
        SELECT batch_id
        FROM user_batches
        WHERE LOWER(user_email) = LOWER(${userEmail})
      `;
      const membershipBatchIds = [
        ...new Set(
          membershipRows
            .map((r) => r.batch_id as string)
            .filter(Boolean)
            .concat(primaryBatchId ? [primaryBatchId] : []),
        ),
      ];
      const batchId = primaryBatchId || membershipBatchIds[0] || "";

      if (!membershipBatchIds.length) {
        const [complianceProgress, courseProgress] = await Promise.all([
          listComplianceProgressForUser(sql, userEmail),
          listCourseProgressForUser(sql, userEmail),
        ]);
        return {
          ok: true as const,
          modules: [],
          progress: [...complianceProgress, ...courseProgress],
          batchId: "",
          displayName,
          role,
          email: userEmail,
        };
      }

      const [complianceModuleRows, courseModuleRows, complianceProgress, courseProgress] =
        await Promise.all([
          sql`
            SELECT
              m.id, m.title, m.description, m.slide_count, m.duration_minutes,
              m.pdf_url, m.content_type, m.module_kind, m.created_at, m.feedback_required,
              ARRAY_AGG(DISTINCT mb_all.batch_id) FILTER (WHERE mb_all.batch_id IS NOT NULL) AS batch_ids
            FROM training_modules m
            INNER JOIN module_batches mb_filter ON mb_filter.module_id = m.id
            LEFT JOIN module_batches mb_all ON mb_all.module_id = m.id
            WHERE mb_filter.batch_id = ANY(${membershipBatchIds})
              AND m.mcq_generation_status = 'completed'
              AND COALESCE(m.module_kind, 'compliance') = 'compliance'
            GROUP BY m.id
            ORDER BY m.created_at DESC
          `,
          sql`
            SELECT
              m.id, m.title, m.description, m.slide_count, m.duration_minutes,
              m.pdf_url, m.content_type, m.created_at, m.feedback_required,
              m.allow_save_exit,
              ARRAY_AGG(DISTINCT mb_all.batch_id) FILTER (WHERE mb_all.batch_id IS NOT NULL) AS batch_ids
            FROM course_modules m
            INNER JOIN course_module_batches mb_filter ON mb_filter.module_id = m.id
            LEFT JOIN course_module_batches mb_all ON mb_all.module_id = m.id
            WHERE mb_filter.batch_id = ANY(${membershipBatchIds})
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

      const moduleIds = new Set([
        ...complianceModules.map((m) => m.id),
        ...courseModules.map((m) => m.id),
      ]);
      const progress = [...complianceProgress, ...courseProgress].filter((p) =>
        moduleIds.has(p.moduleId),
      );

      return {
        ok: true as const,
        modules: [...complianceModules, ...courseModules],
        progress,
        batchId,
        displayName,
        role,
        email: userEmail,
      };
    });

    if (!data.ok) {
      return NextResponse.json(
        { ok: false, error: (data as { error: string }).error },
        { status: (data as { status: number }).status },
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

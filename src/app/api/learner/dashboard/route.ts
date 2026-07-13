import { requireSessionEmail } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { firstNameFromEmail } from "@/lib/auth-env";
import { clientPdfUrl } from "@/lib/pdf-url";
import { listProgressForUser } from "@/lib/services/progress-db-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mapModule(row: Record<string, unknown>, batchIds: string[]) {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    slideCount: row.slide_count as number,
    durationMinutes: row.duration_minutes as number,
    status: "not_started" as const,
    batchIds,
    pdfUrl: clientPdfUrl(row.pdf_url as string),
    contentType: (row.content_type as "text" | "pdf") || "text",
    createdAt: row.created_at
      ? new Date(row.created_at as string).getTime()
      : undefined,
    feedbackRequired: Boolean(row.feedback_required),
  };
}

/** GET — modules + progress for the signed-in learner (batch resolved server-side). */
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
      const progress = await listProgressForUser(sql, userEmail);
      return NextResponse.json({
        ok: true,
        modules: [],
        progress,
        batchId: "",
        displayName,
        role,
        email: userEmail,
      });
    }

    const [moduleRows, progress] = await Promise.all([
      sql`
        SELECT
          m.*,
          ARRAY_AGG(DISTINCT mb_all.batch_id) FILTER (WHERE mb_all.batch_id IS NOT NULL) AS batch_ids
        FROM training_modules m
        INNER JOIN module_batches mb_filter ON mb_filter.module_id = m.id
        LEFT JOIN module_batches mb_all ON mb_all.module_id = m.id
        WHERE mb_filter.batch_id = ${batchId}
          AND m.mcq_generation_status = 'completed'
        GROUP BY m.id
        ORDER BY m.created_at DESC
      `,
      listProgressForUser(sql, userEmail),
    ]);

    const modules = moduleRows.map((moduleRow) =>
      mapModule(
        moduleRow,
        ((moduleRow.batch_ids as string[] | null) ?? []).filter(Boolean),
      ),
    );

    return NextResponse.json({
      ok: true,
      modules,
      progress,
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

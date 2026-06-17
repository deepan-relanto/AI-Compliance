import { getSql } from "@/lib/db";
import { mapTrainingModuleRow } from "@/lib/map-training-module";
import { listProgressForUser } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET ?batchId=&userEmail= — modules + progress in one round trip */
export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batchId");
    const userEmail = req.nextUrl.searchParams.get("userEmail")?.trim() ?? "";

    if (!batchId) {
      return NextResponse.json(
        { ok: false, error: "batchId is required." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const [rows, progress] = await Promise.all([
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
        ORDER BY m.module_kind, m.created_at DESC
      `,
      userEmail ? listProgressForUser(sql, userEmail) : Promise.resolve([]),
    ]);

    const modules = rows.map((row) =>
      mapTrainingModuleRow(
        row as Record<string, unknown>,
        ((row.batch_ids as string[] | null) ?? []).filter(Boolean),
      ),
    );

    return NextResponse.json({ ok: true, modules, progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

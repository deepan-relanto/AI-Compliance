import { getSql } from "@/lib/db";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";
import { publishCourseModuleDb } from "@/lib/services/course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — assign batches and publish a complete course bundle */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const batchIds = Array.isArray(body.batchIds) ? body.batchIds : [];

    const sql = getSql();
    await publishCourseModuleDb(sql, id, batchIds);
    invalidateAdminCaches();
    return NextResponse.json({
      ok: true,
      message: "Course bundle published to selected batches.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

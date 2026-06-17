import { getSql } from "@/lib/db";
import { reuseCourseModuleDb } from "@/lib/services/course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — clone a published course bundle to new batches */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceModuleId, title, description, batchIds } = body;

    if (!sourceModuleId || !title?.trim()) {
      return NextResponse.json(
        { ok: false, message: "sourceModuleId and title are required." },
        { status: 400 },
      );
    }
    if (!Array.isArray(batchIds) || batchIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Select at least one batch." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const result = await reuseCourseModuleDb(sql, {
      sourceModuleId,
      title: title.trim(),
      description: typeof description === "string" ? description : undefined,
      batchIds,
    });

    return NextResponse.json({
      ok: true,
      moduleId: result.id,
      mcqCount: result.mcqCount,
      message: `Course "${title.trim()}" published with ${result.mcqCount} question(s).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reuse failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

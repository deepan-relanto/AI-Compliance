import { getSql } from "@/lib/db";
import { invalidateAdminCachesAsync } from "@/lib/invalidate-admin-cache";
import { finalizeAssessmentDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — compute final score and set pass/fail */
export async function POST(req: NextRequest) {
  try {
    const { userEmail, moduleId } = await req.json();
    if (!userEmail || !moduleId) {
      return NextResponse.json(
        { ok: false, message: "userEmail and moduleId required." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const result = await finalizeAssessmentDb(sql, userEmail, moduleId);
    invalidateAdminCachesAsync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finalize failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

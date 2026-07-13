import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { startScoreRetakeDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — reset assessment for retake when score <= 70% */
export async function POST(req: NextRequest) {
  try {
    const { userEmail, moduleId } = await req.json();
    if (!moduleId) {
      return NextResponse.json(
        { ok: false, message: "moduleId required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const result = await startScoreRetakeDb(sql, access.email, moduleId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retake failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

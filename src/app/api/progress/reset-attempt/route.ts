import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { resetInProgressAttemptDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — clear saved slide/quiz progress so assessment cannot be resumed mid-way */
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
    await resetInProgressAttemptDb(sql, access.email, moduleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

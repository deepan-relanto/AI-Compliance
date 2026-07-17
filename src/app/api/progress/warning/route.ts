import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { syncProctorWarningDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — report a proctor warning event; server owns count/status. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userEmail, moduleId, warningHistory, failedReason } = body;

    if (!moduleId) {
      return NextResponse.json(
        { ok: false, message: "moduleId is required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    const result = await syncProctorWarningDb(sql, {
      userEmail: access.email,
      moduleId: String(moduleId),
      reportedWarningCount:
        typeof body.warningCount === "number" ? body.warningCount : undefined,
      warningHistory: Array.isArray(warningHistory) ? warningHistory : [],
      reportedReason:
        typeof failedReason === "string" ? failedReason : null,
    });

    return NextResponse.json({
      ok: true,
      warningCount: result.warningCount,
      status: result.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync warning";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

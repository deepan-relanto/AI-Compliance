import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { syncProctorWarningDb } from "@/lib/services/course-progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — sync proctor warning count/history from the active training session */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userEmail,
      moduleId,
      warningCount,
      warningHistory,
      status,
      failedReason,
    } = body;

    if (!moduleId || typeof warningCount !== "number") {
      return NextResponse.json(
        { ok: false, message: "moduleId and warningCount are required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    await syncProctorWarningDb(sql, {
      userEmail: access.email,
      moduleId: String(moduleId),
      warningCount,
      warningHistory: Array.isArray(warningHistory) ? warningHistory : [],
      status: String(status ?? "in_progress"),
      failedReason: failedReason ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync warning";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}


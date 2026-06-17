import { getSql } from "@/lib/db";
import { resetInProgressAttemptDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — clear saved slide/quiz progress so assessment cannot be resumed mid-way */
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
    await resetInProgressAttemptDb(sql, userEmail, moduleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

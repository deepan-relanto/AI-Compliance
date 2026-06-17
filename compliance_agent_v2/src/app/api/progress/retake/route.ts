import { getSql } from "@/lib/db";
import { startScoreRetakeDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — reset assessment for retake when score <= 70% */
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
    const result = await startScoreRetakeDb(sql, userEmail, moduleId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retake failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

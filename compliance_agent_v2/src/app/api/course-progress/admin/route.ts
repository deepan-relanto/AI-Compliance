import { getSql } from "@/lib/db";
import {
  listAllProgressAdmin,
  listProgressForBatch,
} from "@/lib/services/course-progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET ?batchId= optional — admin view of learner scores */
export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batchId");
    const sql = getSql();
    const scores = batchId
      ? await listProgressForBatch(sql, batchId)
      : await listAllProgressAdmin(sql);
    return NextResponse.json({ ok: true, scores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load scores";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}


import { getSql } from "@/lib/db";
import {
  getLatestReviewDb,
  submitReviewRequestDb,
} from "@/lib/services/review-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET ?username=&moduleId= — latest review request for learner failed screen */
export async function GET(req: NextRequest) {
  try {
    const username = req.nextUrl.searchParams.get("username");
    const moduleId = req.nextUrl.searchParams.get("moduleId");
    if (!username || !moduleId) {
      return NextResponse.json(
        { ok: false, error: "username and moduleId are required." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const request = await getLatestReviewDb(sql, username, moduleId);
    return NextResponse.json({ ok: true, request });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load review request";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST — submit integrity review request (persists to Neon) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      username,
      moduleId,
      moduleTitle,
      warningCount,
      failureTimestamp,
      userExplanation,
    } = body;

    if (!username || !moduleId || !moduleTitle || !userExplanation?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const request = await submitReviewRequestDb(sql, {
      username,
      moduleId,
      moduleTitle,
      warningCount: Number(warningCount ?? 0),
      failureTimestamp: Number(failureTimestamp ?? Date.now()),
      userExplanation: String(userExplanation).trim(),
    });

    return NextResponse.json({ ok: true, request });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to submit review request";
    const status = message.includes("already under review") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import {
  getLatestReviewDb,
  submitReviewRequestDb,
} from "@/lib/services/course-review-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET ?username=&moduleId= — latest review request for learner failed screen */
export async function GET(req: NextRequest) {
  try {
    const username = req.nextUrl.searchParams.get("username");
    const moduleId = req.nextUrl.searchParams.get("moduleId");
    if (!moduleId) {
      return NextResponse.json(
        { ok: false, error: "moduleId is required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, username);
    if (!access.ok) return access.response;

    const sql = getSql();
    const request = await getLatestReviewDb(sql, access.email, moduleId);
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

    if (!moduleId || !moduleTitle || !userExplanation?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, username);
    if (!access.ok) return access.response;

    const sql = getSql();
    const request = await submitReviewRequestDb(sql, {
      username: access.email,
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


import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  approveReviewRequestDb,
  rejectReviewRequestDb,
} from "@/lib/services/course-review-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function adminIdentity(
  session: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>["session"]>,
): string {
  return (
    session.user?.email?.trim().toLowerCase() ||
    session.user?.name?.trim() ||
    "admin"
  );
}

/** PATCH — approve or reject a course review request (admin only). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) return error!;

    const { requestId } = await params;
    const body = await req.json();
    const { action, comment } = body;
    const adminUsername = adminIdentity(session);

    if (!requestId || !action) {
      return NextResponse.json(
        { ok: false, error: "requestId and action are required." },
        { status: 400 },
      );
    }

    const sql = getSql();

    if (action === "approve") {
      await approveReviewRequestDb(sql, requestId, adminUsername);
    } else if (action === "reject") {
      if (!comment?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Rejection comment is required." },
          { status: 400 },
        );
      }
      await rejectReviewRequestDb(
        sql,
        requestId,
        adminUsername,
        String(comment).trim(),
      );
    } else {
      return NextResponse.json(
        { ok: false, error: "action must be approve or reject." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update review request";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

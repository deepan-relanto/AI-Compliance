import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { createCourseModuleDb } from "@/lib/services/course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — create a course module (admin question bank; no AI generation). */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const body = await req.json();
    const { title, description, durationMinutes, batchIds, feedbackRequired } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { ok: false, message: "title is required." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const { id } = await createCourseModuleDb(sql, {
      title: title.trim(),
      description: typeof description === "string" ? description : "",
      durationMinutes:
        typeof durationMinutes === "number" ? durationMinutes : undefined,
      batchIds: Array.isArray(batchIds) ? batchIds : [],
      feedbackRequired: Boolean(feedbackRequired),
    });

    return NextResponse.json({ ok: true, moduleId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create course";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

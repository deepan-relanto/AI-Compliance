import { getSql } from "@/lib/db";
import type { CourseStepType } from "@/lib/course-step-types";
import {
  getModuleStepsDb,
  upsertModuleStepDb,
} from "@/lib/services/course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STEP_TYPES = new Set(["pdf", "video", "mindmap", "infographic", "quiz"]);

/** GET — list steps for a course bundle */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getSql();
    const steps = await getModuleStepsDb(sql, id);
    return NextResponse.json({ ok: true, steps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load steps";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/** POST — upsert one bundle step */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const stepType = body.stepType as CourseStepType;
    const config = body.config ?? {};

    if (!STEP_TYPES.has(stepType)) {
      return NextResponse.json(
        { ok: false, message: "Invalid stepType." },
        { status: 400 },
      );
    }

    const sql = getSql();
    await upsertModuleStepDb(sql, id, stepType, config);
    const steps = await getModuleStepsDb(sql, id);
    return NextResponse.json({ ok: true, steps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save step";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

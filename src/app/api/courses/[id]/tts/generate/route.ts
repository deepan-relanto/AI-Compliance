import { getSql } from "@/lib/db";
import { generateTtsScriptsForCourse } from "@/lib/services/tts-course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getSql();
    const payload = await generateTtsScriptsForCourse(sql, id);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate TTS scripts";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

import { getSql } from "@/lib/db";
import { generateTtsScriptSegment } from "@/lib/services/tts-course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> },
) {
  try {
    const { id, segmentId } = await params;
    const sql = getSql();
    const payload = await generateTtsScriptSegment(sql, id, segmentId);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate TTS script";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

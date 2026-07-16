import { getSql } from "@/lib/db";
import { updateTtsScriptSegment } from "@/lib/services/tts-course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> },
) {
  try {
    const { id, segmentId } = await params;
    const body = await req.json();
    if (typeof body.scriptText !== "string" || !body.scriptText.trim()) {
      return NextResponse.json(
        { ok: false, message: "scriptText is required." },
        { status: 400 },
      );
    }
    const sql = getSql();
    const payload = await updateTtsScriptSegment(sql, id, segmentId, body.scriptText);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update TTS script";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

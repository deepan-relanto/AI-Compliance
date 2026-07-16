import { getSql } from "@/lib/db";
import { getTtsPlaybackForLearner } from "@/lib/services/tts-course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getSql();
    const payload = await getTtsPlaybackForLearner(sql, id);
    if (!payload) {
      return NextResponse.json({
        ok: true,
        available: false,
        settings: { ttsEnabled: false, avatarEnabled: false, scriptStatus: "not_started" },
        segments: [],
      });
    }
    return NextResponse.json({ ok: true, available: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load TTS playback";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

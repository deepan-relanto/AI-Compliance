import { getSql } from "@/lib/db";
import {
  getTtsSandboxCourse,
  updateTtsSandboxSettings,
} from "@/lib/services/tts-course-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getSql();
    const payload = await getTtsSandboxCourse(sql, id);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load TTS sandbox";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sql = getSql();
    const payload = await updateTtsSandboxSettings(sql, id, {
      ttsEnabled:
        typeof body.ttsEnabled === "boolean" ? body.ttsEnabled : undefined,
      avatarEnabled:
        typeof body.avatarEnabled === "boolean" ? body.avatarEnabled : undefined,
      scriptStatus:
        typeof body.scriptStatus === "string" ? body.scriptStatus : undefined,
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update TTS settings";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

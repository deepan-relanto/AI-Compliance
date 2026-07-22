import { requireSessionEmail } from "@/lib/api-session";
import { getPdfBuffer } from "@/lib/services/pdf-storage-service";
import { NextRequest, NextResponse } from "next/server";

const UPLOAD_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const session = await requireSessionEmail();
  if (!session.ok) return session.response;

  const { filename } = await params;

  if (!UPLOAD_FILENAME.test(filename)) {
    return NextResponse.json({ ok: false, message: "Invalid file." }, { status: 400 });
  }

  try {
    const buffer = await getPdfBuffer(`/uploads/${filename}`);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "PDF not found." }, { status: 404 });
  }
}

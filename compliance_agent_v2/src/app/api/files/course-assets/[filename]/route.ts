import { getCourseAssetBuffer } from "@/lib/services/course-asset-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ASSET_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

function parseRange(rangeHeader: string | null, size: number): { start: number; end: number } | null {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
  const start = Number(startStr);
  const end = endStr ? Number(endStr) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!ASSET_FILENAME.test(filename)) {
    return NextResponse.json({ ok: false, message: "Invalid file." }, { status: 400 });
  }

  try {
    const { buffer, mimeType } = await getCourseAssetBuffer(`/course-assets/${filename}`);
    const size = buffer.length;
    const range = parseRange(req.headers.get("range"), size);

    if (range) {
      const chunk = buffer.subarray(range.start, range.end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Asset not found." }, { status: 404 });
  }
}

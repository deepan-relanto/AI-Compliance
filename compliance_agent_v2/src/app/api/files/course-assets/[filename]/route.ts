import {
  getCourseAssetBuffer,
  getCourseAssetMeta,
  readCourseAssetRange,
} from "@/lib/services/course-asset-service";
import { patchHtmlCourseAsset } from "@/lib/html-embed-patch";
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

function assetHeaders(mimeType: string, length: number, extra?: Record<string, string>) {
  return {
    "Content-Type": mimeType,
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    ...extra,
  };
}

function maybePatchBuffer(buffer: Buffer, filename: string, mimeType: string): Buffer {
  const isHtml =
    filename.toLowerCase().endsWith(".html") ||
    filename.toLowerCase().endsWith(".htm") ||
    mimeType.includes("html");
  return isHtml ? patchHtmlCourseAsset(buffer) : buffer;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!ASSET_FILENAME.test(filename)) {
    return NextResponse.json({ ok: false, message: "Invalid file." }, { status: 400 });
  }

  const assetUrl = `/course-assets/${filename}`;

  try {
    const meta = await getCourseAssetMeta(assetUrl);
    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const range = parseRange(rangeHeader, meta.size);
      if (!range) {
        return new NextResponse(null, { status: 416 });
      }
      const { buffer, mimeType, size } = await readCourseAssetRange(
        assetUrl,
        range.start,
        range.end,
      );
      const body = maybePatchBuffer(buffer, filename, mimeType);
      return new NextResponse(new Uint8Array(body), {
        status: 206,
        headers: assetHeaders(mimeType, body.length, {
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        }),
      });
    }

    const { buffer, mimeType } = await getCourseAssetBuffer(assetUrl);
    const body = maybePatchBuffer(buffer, filename, mimeType);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: assetHeaders(mimeType, body.length),
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Asset not found." }, { status: 404 });
  }
}

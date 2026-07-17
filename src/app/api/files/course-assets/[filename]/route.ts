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

/** Neon HTTP SQL cannot return multi‑MB blobs in one query — stream/cap instead. */
const LARGE_STREAM_BYTES = 4 * 1024 * 1024;
const STREAM_CHUNK_BYTES = 2 * 1024 * 1024;

function parseRange(rangeHeader: string | null, size: number): { start: number; end: number } | null {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  // Only first range; browsers rarely send multiparts for video.
  const spec = rangeHeader.replace("bytes=", "").split(",")[0]?.trim() ?? "";
  const [startStr, endStr] = spec.split("-");
  const start = startStr === "" ? NaN : Number(startStr);
  const end = endStr === "" || endStr == null ? size - 1 : Number(endStr);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

/**
 * Cap a single Range body so Neon substring stays under HTTP SQL limits.
 * Returning a smaller 206 than requested is valid HTTP progressive download.
 */
function capRange(range: { start: number; end: number }): { start: number; end: number } {
  const maxEnd = range.start + STREAM_CHUNK_BYTES - 1;
  return { start: range.start, end: Math.min(range.end, maxEnd) };
}

function isHtmlAsset(filename: string, mimeType: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".html") ||
    lower.endsWith(".htm") ||
    mimeType.toLowerCase().includes("html")
  );
}

function assetHeaders(
  mimeType: string,
  length: number,
  filename: string,
  extra?: Record<string, string>,
) {
  // Images must not stick for an hour — patched infographics (e.g. watermark
  // removal) would otherwise keep serving the old bytes from browser cache.
  const cacheControl = isHtmlAsset(filename, mimeType)
    ? "private, no-cache, must-revalidate"
    : mimeType.startsWith("image/")
      ? "public, max-age=60, must-revalidate"
      : "public, max-age=3600";
  return {
    "Content-Type": mimeType,
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
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

function streamAssetResponse(assetUrl: string, mimeType: string, size: number, filename: string) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let start = 0; start < size; start += STREAM_CHUNK_BYTES) {
          const end = Math.min(size - 1, start + STREAM_CHUNK_BYTES - 1);
          const { buffer } = await readCourseAssetRange(assetUrl, start, end);
          controller.enqueue(new Uint8Array(buffer));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: assetHeaders(mimeType, size, filename),
  });
}

async function serveAsset(req: NextRequest, filename: string) {
  if (!ASSET_FILENAME.test(filename)) {
    return NextResponse.json({ ok: false, message: "Invalid file." }, { status: 400 });
  }

  const assetUrl = `/course-assets/${filename}`;
  const isHead = req.method === "HEAD";

  try {
    const meta = await getCourseAssetMeta(assetUrl);
    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const parsed = parseRange(rangeHeader, meta.size);
      if (!parsed) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${meta.size}` },
        });
      }
      const range = capRange(parsed);
      const length = range.end - range.start + 1;
      if (isHead) {
        return new NextResponse(null, {
          status: 206,
          headers: assetHeaders(meta.mimeType, length, filename, {
            "Content-Range": `bytes ${range.start}-${range.end}/${meta.size}`,
          }),
        });
      }
      const { buffer, mimeType, size } = await readCourseAssetRange(
        assetUrl,
        range.start,
        range.end,
      );
      const body = maybePatchBuffer(buffer, filename, mimeType);
      return new NextResponse(new Uint8Array(body), {
        status: 206,
        headers: assetHeaders(mimeType, body.length, filename, {
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        }),
      });
    }

    if (meta.size > LARGE_STREAM_BYTES) {
      if (isHead) {
        return new NextResponse(null, {
          status: 200,
          headers: assetHeaders(meta.mimeType, meta.size, filename),
        });
      }
      return streamAssetResponse(assetUrl, meta.mimeType, meta.size, filename);
    }

    const { buffer, mimeType } = await getCourseAssetBuffer(assetUrl);
    const body = maybePatchBuffer(buffer, filename, mimeType);
    if (isHead) {
      return new NextResponse(null, {
        status: 200,
        headers: assetHeaders(mimeType, body.length, filename),
      });
    }
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: assetHeaders(mimeType, body.length, filename),
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Asset not found." }, { status: 404 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return serveAsset(req, filename);
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return serveAsset(req, filename);
}

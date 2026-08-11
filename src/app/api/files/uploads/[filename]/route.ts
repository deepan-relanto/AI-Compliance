import { auth } from "@/auth";
import {
  getCachedAssetAccess,
  setCachedAssetAccess,
} from "@/lib/asset-access-cache";
import { getSql } from "@/lib/db";
import { canAccessUploadPdf } from "@/lib/services/file-access-service";
import { getPdfBuffer } from "@/lib/services/pdf-storage-service";
import { NextRequest, NextResponse } from "next/server";

const UPLOAD_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) {
    return NextResponse.json(
      { ok: false, message: "Sign in required." },
      { status: 401 },
    );
  }
  const isAdmin = session?.user?.role === "admin";

  const { filename } = await params;

  if (!UPLOAD_FILENAME.test(filename)) {
    return NextResponse.json({ ok: false, message: "Invalid file." }, { status: 400 });
  }

  const pdfUrl = `/uploads/${filename}`;
  const cached = getCachedAssetAccess(email, pdfUrl);
  const allowed =
    cached ??
    (await canAccessUploadPdf(getSql(), email, pdfUrl, isAdmin).then((ok) => {
      setCachedAssetAccess(email, pdfUrl, ok);
      return ok;
    }));
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: "Not authorized for this file." },
      { status: 403 },
    );
  }

  try {
    const buffer = await getPdfBuffer(pdfUrl);
    const etag = `"${buffer.length}-${filename}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=3600" },
      });
    }
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
        ETag: etag,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "PDF not found." }, { status: 404 });
  }
}

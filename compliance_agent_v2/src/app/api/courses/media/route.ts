import {
  isAllowedCourseAsset,
  storeCourseAsset,
} from "@/lib/services/course-asset-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 100 * 1024 * 1024;

/** POST multipart: kind=video|mindmap|infographic, file=... */
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const hint =
      raw.includes("FormData") || raw.includes("boundary")
        ? "Upload may exceed the server body limit. Restart the dev server after config changes, or use a smaller file."
        : "Invalid multipart upload.";
    return NextResponse.json({ ok: false, message: hint }, { status: 400 });
  }

  try {
    const kind = String(formData.get("kind") ?? "");
    const file = formData.get("file");

    if (!["video", "mindmap", "infographic"].includes(kind)) {
      return NextResponse.json(
        { ok: false, message: "kind must be video, mindmap, or infographic." },
        { status: 400 },
      );
    }

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, message: "No file provided." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: "File exceeds the 100 MB limit." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (
      !isAllowedCourseAsset(
        kind as "video" | "mindmap" | "infographic",
        file.type,
        file.name,
      )
    ) {
      return NextResponse.json(
        { ok: false, message: `Invalid file type for ${kind}.` },
        { status: 415 },
      );
    }

    const stored = await storeCourseAsset(
      buffer,
      file.name,
      file.type || "application/octet-stream",
      kind as "video" | "mindmap" | "infographic",
    );

    return NextResponse.json({ ok: true, ...stored });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

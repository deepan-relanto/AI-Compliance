import { requireAdminSession } from "@/lib/api-admin";
import { CACHE_TTL, cachedFetch } from "@/lib/api-cache";
import { getSql } from "@/lib/db";
import { listCourseLibraryDb } from "@/lib/services/course-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — published course bundles available for reuse */
export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const library = await cachedFetch("content:course-library", CACHE_TTL.courseLibrary, async () => {
      const sql = getSql();
      return listCourseLibraryDb(sql);
    });
    return NextResponse.json({ ok: true, library });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load library";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

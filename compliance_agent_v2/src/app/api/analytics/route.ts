import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { getAnalytics } from "@/lib/services/analytics-service";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — organization-wide analytics for admin dashboard */
export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const trackParam = req.nextUrl.searchParams.get("track");
    const track = trackParam === "course" ? "course" : "compliance";
    const cacheKey = `${CACHE_KEYS.analytics}:${track}`;
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { ok: true, ...cached, track, _cached: true },
        { headers: { "X-Cache": "HIT" } },
      );
    }

    const sql = getSql();
    const data = await getAnalytics(sql, track);
    cacheSet(cacheKey, data, 45);
    return NextResponse.json(
      { ok: true, ...data, track },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analytics";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

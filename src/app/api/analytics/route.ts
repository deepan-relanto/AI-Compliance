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
    const view = req.nextUrl.searchParams.get("view") === "home" ? "home" : "full";
    const cacheKey = `${CACHE_KEYS.analytics}:${track}:${view}`;
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { ok: true, ...cached, track, view, _cached: true },
        { headers: { "X-Cache": "HIT" } },
      );
    }

    const sql = getSql();
    const data = await getAnalytics(sql, track, { view });
    // Home KPIs change less often than full analytics drill-downs.
    cacheSet(cacheKey, data, view === "home" ? 90 : 120);
    return NextResponse.json(
      { ok: true, ...data, track, view },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analytics";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

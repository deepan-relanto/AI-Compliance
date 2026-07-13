import { getSql } from "@/lib/db";
import { getAnalytics } from "@/lib/services/analytics-service";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/api-cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — organization-wide analytics for admin dashboard */
export async function GET() {
  try {
    // Serve from cache when available (45 s TTL)
    const cached = cacheGet<object>(CACHE_KEYS.analytics);
    if (cached) {
      return NextResponse.json(
        { ok: true, ...cached, _cached: true },
        { headers: { "X-Cache": "HIT" } },
      );
    }

    const sql = getSql();
    const data = await getAnalytics(sql);
    cacheSet(CACHE_KEYS.analytics, data, 45);
    return NextResponse.json(
      { ok: true, ...data },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analytics";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

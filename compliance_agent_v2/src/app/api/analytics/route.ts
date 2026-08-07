import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { getAnalytics } from "@/lib/services/analytics-service";
import { cacheGetSWR, cacheSet, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AnalyticsTrack = "compliance" | "course";
type AnalyticsView = "home" | "full";

async function loadAndCache(
  track: AnalyticsTrack,
  view: AnalyticsView,
): Promise<object> {
  const sql = getSql();
  const data = await getAnalytics(sql, track, { view });
  const soft = view === "home" ? 120 : 180;
  const hard = view === "home" ? 360 : 540;
  cacheSet(`${CACHE_KEYS.analytics}:${track}:${view}`, data, soft, hard);
  return data;
}

/** GET — organization-wide analytics for admin dashboard */
export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const trackParam = req.nextUrl.searchParams.get("track");
    const track: AnalyticsTrack =
      trackParam === "course" ? "course" : "compliance";
    const view: AnalyticsView =
      req.nextUrl.searchParams.get("view") === "home" ? "home" : "full";
    const cacheKey = `${CACHE_KEYS.analytics}:${track}:${view}`;
    const cached = cacheGetSWR<object>(cacheKey);

    if (cached) {
      if (!cached.fresh) {
        queueMicrotask(() => {
          void loadAndCache(track, view).catch(() => undefined);
        });
      }
      return NextResponse.json(
        { ok: true, ...cached.data, track, view, _cached: true },
        {
          headers: {
            "X-Cache": cached.fresh ? "HIT" : "STALE",
            "Cache-Control": "private, no-cache",
          },
        },
      );
    }

    const data = await loadAndCache(track, view);
    return NextResponse.json(
      { ok: true, ...data, track, view },
      { headers: { "X-Cache": "MISS", "Cache-Control": "private, no-cache" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analytics";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

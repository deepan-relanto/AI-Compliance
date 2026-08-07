import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  getBatchPerformance,
  type AnalyticsTrack,
} from "@/lib/services/batch-performance-service";
import { cacheGetSWR, cacheSet, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function loadAndCache(batchId: string, track: AnalyticsTrack) {
  const sql = getSql();
  const payload = await getBatchPerformance(sql, batchId, track);
  if (payload) {
    cacheSet(CACHE_KEYS.batchPerformance(batchId, track), payload, 90, 270);
  }
  return payload;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { batchId } = await params;
    const trackParam = req.nextUrl.searchParams.get("track");
    const track: AnalyticsTrack =
      trackParam === "course" ? "course" : "compliance";

    const cacheKey = CACHE_KEYS.batchPerformance(batchId, track);
    const cached = cacheGetSWR<object>(cacheKey);
    if (cached) {
      if (!cached.fresh) {
        queueMicrotask(() => {
          void loadAndCache(batchId, track).catch(() => undefined);
        });
      }
      return NextResponse.json(
        { ok: true, ...cached.data, track, _cached: true },
        {
          headers: {
            "X-Cache": cached.fresh ? "HIT" : "STALE",
            "Cache-Control": "private, no-cache",
          },
        },
      );
    }

    const payload = await loadAndCache(batchId, track);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, ...payload, track },
      { headers: { "X-Cache": "MISS", "Cache-Control": "private, no-cache" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load batch performance";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

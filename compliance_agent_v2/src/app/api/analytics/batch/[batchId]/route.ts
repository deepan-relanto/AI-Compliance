import { getSql } from "@/lib/db";
import {
  getBatchPerformance,
  type AnalyticsTrack,
} from "@/lib/services/batch-performance-service";
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    const trackParam = req.nextUrl.searchParams.get("track");
    const track: AnalyticsTrack =
      trackParam === "course" ? "course" : "compliance";

    const cacheKey = CACHE_KEYS.batchPerformance(batchId, track);
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { ok: true, ...cached, track, _cached: true },
        { headers: { "X-Cache": "HIT" } },
      );
    }

    const sql = getSql();
    const payload = await getBatchPerformance(sql, batchId, track);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }
    cacheSet(cacheKey, payload, 60);
    return NextResponse.json(
      { ok: true, ...payload, track },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch performance";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

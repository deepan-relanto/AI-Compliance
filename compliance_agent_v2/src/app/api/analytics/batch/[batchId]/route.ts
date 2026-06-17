import { CACHE_TTL, cachedFetch } from "@/lib/api-cache";
import { getSql } from "@/lib/db";
import type { ModuleKind } from "@/lib/module-kind";
import { getBatchPerformance } from "@/lib/services/batch-performance-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    const trackParam = req.nextUrl.searchParams.get("track");
    const moduleKind: ModuleKind =
      trackParam === "course" ? "course" : "compliance";
    const cacheKey = `analytics:batch:${batchId}:${moduleKind}`;
    const payload = await cachedFetch(cacheKey, CACHE_TTL.batchPerformance, async () => {
      const sql = getSql();
      return getBatchPerformance(sql, batchId, moduleKind);
    });
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch performance";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { CACHE_TTL, cachedFetch } from "@/lib/api-cache";
import { getSql } from "@/lib/db";
import { getAnalytics } from "@/lib/services/analytics-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — organization-wide analytics for admin dashboard */
export async function GET() {
  try {
    const data = await cachedFetch("analytics:org", CACHE_TTL.analytics, async () => {
      const sql = getSql();
      return getAnalytics(sql);
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analytics";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

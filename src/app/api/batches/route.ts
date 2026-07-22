import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { createBatch } from "@/lib/services/batch-management-service";
import { cacheGet, cacheSet, cacheInvalidate, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const cached = cacheGet<object[]>(CACHE_KEYS.batches);
    if (cached) {
      return NextResponse.json(
        { ok: true, batches: cached },
        { headers: { "X-Cache": "HIT" } },
      );
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, label, description, member_count, compliance, pass_rate, fail_rate, active_sessions
      FROM batches
      ORDER BY label
    `;
    cacheSet(CACHE_KEYS.batches, rows, 60);
    return NextResponse.json(
      { ok: true, batches: rows },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batches";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const body = await req.json();
    const label = String(body.label ?? "").trim();
    const description = String(body.description ?? "").trim();
    const employeeEmails = Array.isArray(body.employeeEmails)
      ? body.employeeEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];

    if (!label) {
      return NextResponse.json({ ok: false, error: "Batch name is required." }, { status: 400 });
    }
    if (!employeeEmails.length) {
      return NextResponse.json(
        { ok: false, error: "Select at least one employee." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const batch = await createBatch(sql, { label, description, employeeEmails });
    // Invalidate stale caches asynchronously so the response is not blocked
    void Promise.resolve().then(() => {
      cacheInvalidate(CACHE_KEYS.batches, CACHE_KEYS.analytics);
    });
    return NextResponse.json({ ok: true, batch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create batch";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

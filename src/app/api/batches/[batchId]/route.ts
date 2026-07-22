import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  addBatchMembers,
  deleteBatch,
  removeBatchMembers,
} from "@/lib/services/batch-management-service";
import { cacheInvalidate, CACHE_KEYS } from "@/lib/api-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { batchId } = await params;
    const sql = getSql();

    const batchRows = await sql`
      SELECT id, label, description, member_count, compliance, pass_rate, fail_rate, active_sessions
      FROM batches WHERE id = ${batchId} LIMIT 1
    `;
    if (batchRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }

    const b = batchRows[0];
    const users = await sql`
      SELECT email, display_name, role
      FROM users
      WHERE batch_id = ${batchId}
      ORDER BY email
    `;

    return NextResponse.json({
      ok: true,
      batch: {
        id: b.id,
        label: b.label,
        description: b.description,
        memberCount: b.member_count,
        compliance: b.compliance,
        passRate: b.pass_rate,
        failRate: b.fail_rate,
        activeSessions: b.active_sessions,
      },
      users: users.map((u) => ({
        email: u.email,
        displayName: u.display_name ?? u.email,
        role: u.role,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { batchId } = await params;
    const body = await req.json();
    const sql = getSql();

    if (body.action === "add") {
      const emails = Array.isArray(body.employeeEmails)
        ? body.employeeEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
        : [];
      if (!emails.length) {
        return NextResponse.json({ ok: false, error: "No employees selected." }, { status: 400 });
      }
      const added = await addBatchMembers(sql, batchId, emails);
      void Promise.resolve().then(() => cacheInvalidate(CACHE_KEYS.batches, CACHE_KEYS.analytics));
      return NextResponse.json({ ok: true, added });
    }

    if (body.action === "remove") {
      const emails = Array.isArray(body.employeeEmails)
        ? body.employeeEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
        : [];
      if (!emails.length) {
        return NextResponse.json({ ok: false, error: "No members specified." }, { status: 400 });
      }
      const removed = await removeBatchMembers(sql, batchId, emails);
      void Promise.resolve().then(() => cacheInvalidate(CACHE_KEYS.batches, CACHE_KEYS.analytics));
      return NextResponse.json({ ok: true, removed });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update batch";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { batchId } = await params;
    const sql = getSql();
    const deleted = await deleteBatch(sql, batchId);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }
    void Promise.resolve().then(() => cacheInvalidate(CACHE_KEYS.batches, CACHE_KEYS.analytics));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete batch";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

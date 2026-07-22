import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { generateAndStoreModuleMcqs, hashPdfFile } from "@/lib/services/mcq-generation-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseProgress(status: string): number {
  if (status === "completed") return 100;
  if (status === "failed") return 100;
  const match = status.match(/^generating_(\d{1,3})$/);
  if (match) return Math.min(99, Math.max(0, Number(match[1])));
  if (status === "pending") return 0;
  if (status === "generating") return 20;
  return 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sql = getSql();
    const rows = await sql`
      SELECT mcq_generation_status FROM training_modules WHERE id = ${id} LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: "Module not found." }, { status: 404 });
    }

    const countRows = await sql`
      SELECT COUNT(*)::int AS c FROM mcq_questions WHERE module_id = ${id}
    `;
    const status = String(rows[0].mcq_generation_status ?? "pending");
    return NextResponse.json({
      ok: true,
      status,
      progress: parseProgress(status),
      questionCount: Number(countRows[0]?.c ?? 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load generation status";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const sql = getSql();
    const rows = await sql`
      SELECT id, title, pdf_url, slide_count, content_hash
      FROM training_modules
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: "Module not found." }, { status: 404 });
    }

    const row = rows[0] as {
      id: string;
      title: string;
      pdf_url: string;
      slide_count: number;
      content_hash: string | null;
    };

    const contentHash = row.content_hash ?? (await hashPdfFile(row.pdf_url));

    await sql`
      UPDATE training_modules
      SET mcq_generation_status = 'pending', content_hash = ${contentHash}, updated_at = NOW()
      WHERE id = ${id}
    `;

    void generateAndStoreModuleMcqs(sql, {
      moduleId: row.id,
      moduleTitle: row.title,
      pdfUrl: row.pdf_url,
      pageCount: Number(row.slide_count ?? 1),
      contentHash,
      force: true,
    }).catch(async (err) => {
      console.error("[generation-status POST retry]", err);
      await sql`
        UPDATE training_modules
        SET mcq_generation_status = 'failed', updated_at = NOW()
        WHERE id = ${id}
      `;
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      status: "pending",
      progress: 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retry generation";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

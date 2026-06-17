import { CACHE_TTL, cachedFetch } from "@/lib/api-cache";
import { getSql } from "@/lib/db";
import { NextResponse } from "next/server";
import { pdfExists } from "@/lib/services/pdf-storage-service";

export const dynamic = "force-dynamic";

/** GET — published modules available for reuse (with MCQ counts) */
export async function GET() {
  try {
    const library = await cachedFetch("content:compliance-library", CACHE_TTL.courseLibrary, async () => {
      const sql = getSql();
      const modules = await sql`
      SELECT
        tm.id,
        tm.title,
        tm.description,
        tm.slide_count,
        tm.pdf_url,
        tm.content_hash,
        tm.mcq_generation_status,
        tm.created_at,
        (SELECT COUNT(*)::int FROM mcq_questions mq WHERE mq.module_id = tm.id) AS mcq_count
      FROM training_modules tm
      WHERE tm.content_type = 'pdf' AND tm.pdf_url IS NOT NULL
        AND tm.module_kind = 'compliance'
      ORDER BY tm.created_at DESC
    `;

    const batchRows = await sql`
      SELECT mb.module_id, b.id AS batch_id, b.label
      FROM module_batches mb
      JOIN batches b ON b.id = mb.batch_id
      JOIN training_modules tm ON tm.id = mb.module_id AND tm.module_kind = 'compliance'
    `;
    const batchesByModule: Record<string, { id: string; label: string }[]> = {};
    for (const row of batchRows) {
      const mid = row.module_id as string;
      if (!batchesByModule[mid]) batchesByModule[mid] = [];
      batchesByModule[mid].push({
        id: row.batch_id as string,
        label: row.label as string,
      });
    }

    const library = await Promise.all(
      modules.map(async (m) => {
        const pdfUrl = m.pdf_url as string;
        const pdfAvailable = await pdfExists(pdfUrl);

        return {
          id: m.id as string,
          title: m.title as string,
          description: m.description as string,
          slideCount: Number(m.slide_count),
          pdfUrl,
          contentHash: m.content_hash as string | null,
          mcqGenerationStatus: m.mcq_generation_status as string,
          moduleKind: "compliance" as const,
          mcqCount: Number(m.mcq_count ?? 0),
          createdAt: m.created_at,
          batches: batchesByModule[m.id as string] ?? [],
          canReuse:
            pdfAvailable &&
            Number(m.mcq_count ?? 0) > 0 &&
            m.mcq_generation_status === "completed",
        };
      }),
    );
      return library;
    });

    return NextResponse.json({ ok: true, library });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load library";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

import { getSql } from "@/lib/db";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";
import { copyMcqsFromModule } from "@/lib/services/mcq-copy-service";
import { sendModuleInvitationEmails } from "@/lib/services/training-notification-service";
import {
  generateAndStoreModuleMcqs,
  hashPdfFile,
} from "@/lib/services/mcq-generation-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST — persist uploaded assessment, assign batches, generate or reuse MCQs */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      title,
      description,
      slideCount,
      durationMinutes,
      pdfUrl,
      batchIds = ["all"],
      feedbackRequired = false,
      uploadedBy,
      questionMode = "ai",
      reuseModuleId,
    } = body;

    if (!id || !title || !pdfUrl) {
      return NextResponse.json(
        { ok: false, message: "id, title, and pdfUrl are required." },
        { status: 400 },
      );
    }

    const sql = getSql();
    let contentHash: string;
    const resolvedPdfUrl = pdfUrl as string;
    const resolvedSlideCount = slideCount ?? 1;

    try {
      contentHash = await hashPdfFile(pdfUrl);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: reuseModuleId
            ? "The source PDF for this reusable content is missing. Re-upload the PDF before publishing it to more batches."
            : "PDF file not found on server. Upload again.",
        },
        { status: 400 },
      );
    }

    await sql`
      INSERT INTO training_modules (
        id, title, description, slide_count, duration_minutes,
        content_type, pdf_url, feedback_required, content_hash, mcq_generation_status, module_kind
      )
      VALUES (
        ${id},
        ${title},
        ${description ?? ""},
        ${resolvedSlideCount},
        ${durationMinutes ?? 20},
        'pdf',
        ${resolvedPdfUrl},
        ${feedbackRequired},
        ${contentHash},
        'pending',
        'compliance'
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        slide_count = EXCLUDED.slide_count,
        duration_minutes = EXCLUDED.duration_minutes,
        pdf_url = EXCLUDED.pdf_url,
        content_hash = EXCLUDED.content_hash,
        mcq_generation_status = 'pending',
        module_kind = 'compliance',
        updated_at = NOW()
    `;

    if (batchIds.includes("all")) {
      const rows = await sql`SELECT id FROM batches`;
      for (const row of rows) {
        await sql`
          INSERT INTO module_batches (module_id, batch_id)
          VALUES (${id}, ${row.id})
          ON CONFLICT DO NOTHING
        `;
      }
    } else {
      for (const batchId of batchIds as string[]) {
        await sql`
          INSERT INTO module_batches (module_id, batch_id)
          VALUES (${id}, ${batchId})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    await sql`
      INSERT INTO upload_files (original_name, pdf_url, page_count, uploaded_by, module_id, content_hash)
      VALUES (${title}, ${resolvedPdfUrl}, ${resolvedSlideCount}, ${uploadedBy ?? null}, ${id}, ${contentHash})
    `;

    // Reuse flow: copy existing MCQs from a published source module and complete instantly.
    if (reuseModuleId) {
      const sourceRows = await sql`
        SELECT id FROM training_modules WHERE id = ${String(reuseModuleId)} LIMIT 1
      `;
      if (sourceRows.length === 0) {
        return NextResponse.json(
          { ok: false, message: "Source module for reuse was not found." },
          { status: 400 },
        );
      }

      const copied = await copyMcqsFromModule(sql, String(reuseModuleId), id);
      if (copied === 0) {
        return NextResponse.json(
          { ok: false, message: "Source module has no reusable questions yet." },
          { status: 400 },
        );
      }

      await sql`
        UPDATE training_modules
        SET mcq_generation_status = 'completed', updated_at = NOW()
        WHERE id = ${id}
      `;

      void sendModuleInvitationEmails(sql, id).catch((err) => {
        console.error("[assessments reuse invite emails]", err);
      });

      invalidateAdminCaches();

      return NextResponse.json({
        ok: true,
        id,
        pdfUrl: resolvedPdfUrl,
        queued: false,
        reused: true,
        mcqCount: copied,
        generationStatus: "completed",
      });
    }

    const mode = String(questionMode ?? "ai").toLowerCase();
    if (mode !== "ai") {
      return NextResponse.json(
        { ok: false, message: "Only AI mode is supported." },
        { status: 400 },
      );
    }

    await sql`
      UPDATE training_modules
      SET mcq_generation_status = 'pending', updated_at = NOW()
      WHERE id = ${id}
    `;

    void generateAndStoreModuleMcqs(sql, {
      moduleId: id,
      moduleTitle: title,
      pdfUrl: resolvedPdfUrl,
      pageCount: resolvedSlideCount,
      contentHash,
    }).catch(async (err) => {
      console.error("[assessments POST background generation]", err);
      await sql`
        UPDATE training_modules
        SET mcq_generation_status = 'failed', updated_at = NOW()
        WHERE id = ${id}
      `;
    });

    invalidateAdminCaches();

    return NextResponse.json({
      ok: true,
      id,
      pdfUrl: resolvedPdfUrl,
      queued: true,
      generationStatus: "pending",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[assessments POST]", message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

import { clientPdfUrl } from "@/lib/pdf-url";
import { resolveModuleKind } from "@/lib/module-kind";
import type { ContentType, ModuleStatus, TrainingModule } from "@/lib/types";

export function mapTrainingModuleRow(
  row: Record<string, unknown>,
  batchIds: string[],
): TrainingModule {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    slideCount: Number(row.slide_count ?? 1),
    durationMinutes: Number(row.duration_minutes ?? 20),
    status: (row.status_default as ModuleStatus) ?? "not_started",
    batchIds,
    pdfUrl: row.pdf_url ? clientPdfUrl(row.pdf_url as string) : undefined,
    contentType: (row.content_type as ContentType) || "text",
    moduleKind: resolveModuleKind(row.module_kind, row.id as string),
    createdAt: row.created_at
      ? new Date(row.created_at as string).getTime()
      : undefined,
    feedbackRequired: Boolean(row.feedback_required),
  };
}

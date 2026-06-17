import type { FeedbackEntry } from "@/lib/feedback-store";
import { parseRating } from "@/lib/feedback-store";
import Papa from "papaparse";

export interface FeedbackDisplayRow extends FeedbackEntry {
  batchId: string | null;
  batchLabel: string | null;
  createdAtMs: number;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFeedbackCsv(
  rows: FeedbackDisplayRow[],
  batchLabel?: string,
) {
  const csvRows = rows.map((r) => {
    const { rating, body } = parseRating(r.feedbackText);
    return {
      learner: r.userId,
      batch: r.batchLabel ?? r.batchId ?? "Unknown",
      assessment: r.assessmentName,
      assessment_id: r.assessmentId,
      rating: rating ?? "",
      feedback: body,
      submitted_at: new Date(r.createdAtMs).toISOString(),
    };
  });

  const slug = batchLabel
    ? batchLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    : "all-batches";
  const csv = Papa.unparse(csvRows);
  downloadBlob(
    `feedback-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
}

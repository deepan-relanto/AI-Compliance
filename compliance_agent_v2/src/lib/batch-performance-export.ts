import type { BatchPerformancePayload } from "@/lib/batch-performance-types";
import Papa from "papaparse";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function exportBatchPerformanceCsv(data: BatchPerformancePayload) {
  const rows = data.learners.flatMap((learner) => {
    if (learner.assessments.length === 0) {
      return [
        {
          batch: data.batch.label,
          learner: learner.email,
          name: learner.displayName,
          assessment: "",
          status: "not started",
          score_percent: "",
          mcq_correct: 0,
          mcq_total: 0,
          retakes: 0,
          last_activity: "",
        },
      ];
    }
    return learner.assessments.map((a) => ({
      batch: data.batch.label,
      learner: learner.email,
      name: learner.displayName,
      assessment: a.moduleTitle,
      status: formatStatus(a.status),
      score_percent: a.scorePercent ?? "",
      mcq_correct: a.mcqCorrect,
      mcq_total: a.mcqTotal,
      retakes: a.retakeCount,
      last_activity: a.completedAt ?? a.updatedAt ?? a.lastAccessedAt ?? "",
    }));
  });

  const summaryRows = [
    {
      batch: data.batch.label,
      members: data.batch.memberCount,
      modules_assigned: data.summary.modulesAssigned,
      learners_started: data.summary.learnersStarted,
      completed: data.summary.completed,
      in_progress: data.summary.inProgress,
      avg_score: data.summary.avgScore ?? "",
      pass_rate: data.summary.passRate ?? "",
      compliance_percent: data.summary.compliance,
    },
  ];

  const csv = [
    "# Compliance Agent — Batch Performance Export",
    `# Generated: ${data.generatedAt}`,
    "",
    "## Batch Summary",
    Papa.unparse(summaryRows),
    "",
    "## Learner Marks",
    Papa.unparse(rows),
  ].join("\n");

  const slug = data.batch.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  downloadBlob(
    `batch-marks-${slug || data.batch.id}-${new Date().toISOString().slice(0, 10)}.csv`,
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
}

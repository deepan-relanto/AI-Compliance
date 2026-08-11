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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function exportBatchPerformanceCsv(
  data: BatchPerformancePayload,
  options?: { moduleId?: string | null },
) {
  const moduleId = options?.moduleId?.trim() || null;
  const moduleMeta = moduleId
    ? data.modules.find((m) => m.id === moduleId) ??
      data.moduleSummaries.find((m) => m.id === moduleId)
    : null;
  const moduleSummary = moduleId
    ? data.moduleSummaries.find((m) => m.id === moduleId)
    : null;

  const rows = data.learners.flatMap((learner) => {
    const assessments = moduleId
      ? learner.assessments.filter((a) => a.moduleId === moduleId)
      : learner.assessments;

    if (assessments.length === 0) {
      if (moduleId) {
        return [
          {
            batch: data.batch.label,
            learner: learner.email,
            name: learner.displayName,
            assessment: moduleMeta?.title ?? "",
            status: "not started",
            score_percent: "",
            mcq_correct: 0,
            mcq_total: 0,
            retakes: 0,
            last_activity: "",
          },
        ];
      }
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

    return assessments.map((a) => ({
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

  const summaryRows = moduleSummary
    ? [
        {
          batch: data.batch.label,
          members: data.batch.memberCount,
          assessment: moduleSummary.title,
          modules_assigned: 1,
          learners_started: moduleSummary.started,
          completed: moduleSummary.completed,
          in_progress: moduleSummary.inProgress,
          not_started: moduleSummary.notStarted,
          failed: moduleSummary.failed,
          avg_score: moduleSummary.avgScore ?? "",
          pass_rate: moduleSummary.passRate ?? "",
          compliance_percent: moduleSummary.compliance,
        },
      ]
    : [
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
    moduleId
      ? "# Compliance Agent — Module Performance Export"
      : "# Compliance Agent — Batch Performance Export",
    `# Generated: ${data.generatedAt}`,
    ...(moduleId ? [`# Module: ${moduleMeta?.title ?? moduleId}`] : []),
    "",
    moduleId ? "## Module Summary" : "## Batch Summary",
    Papa.unparse(summaryRows),
    "",
    "## Learner Marks",
    Papa.unparse(rows),
  ].join("\n");

  const batchSlug = slugify(data.batch.label) || data.batch.id;
  const moduleSlug = moduleMeta ? slugify(moduleMeta.title) : "";
  const date = new Date().toISOString().slice(0, 10);
  const filename = moduleSlug
    ? `batch-marks-${batchSlug}-${moduleSlug}-${date}.csv`
    : `batch-marks-${batchSlug}-${date}.csv`;

  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

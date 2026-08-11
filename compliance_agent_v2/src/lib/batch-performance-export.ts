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

/** Excel-friendly local datetime (empty when missing). */
function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type LearnerExportRow = {
  "Batch": string;
  "Learner Name": string;
  "Email": string;
  "Assessment": string;
  "Status": string;
  "Score (%)": string | number;
  "Correct": number;
  "Total Questions": number;
  "Retakes Used": number;
  "Date Assigned": string;
  "Invite Emails": number;
  "Reminder Emails": number;
  "Guidance Emails": number;
  "Total Emails Sent": number;
  "Proctor Warnings": number;
  "Completion Date": string;
  "Last Activity": string;
};

export function exportBatchPerformanceCsv(
  data: BatchPerformancePayload,
  options?: { moduleId?: string | null },
) {
  const moduleId = options?.moduleId?.trim() || null;
  if (!moduleId) {
    // Per-module exports only — avoid mixed multi-module sheets.
    console.warn("[export] moduleId is required for CSV export");
  }

  const moduleMeta = moduleId
    ? data.modules.find((m) => m.id === moduleId) ??
      data.moduleSummaries.find((m) => m.id === moduleId)
    : null;
  const moduleSummary = moduleId
    ? data.moduleSummaries.find((m) => m.id === moduleId)
    : null;

  const rows: LearnerExportRow[] = data.learners.flatMap((learner) => {
    const assessments = moduleId
      ? learner.assessments.filter((a) => a.moduleId === moduleId)
      : learner.assessments;

    if (assessments.length === 0) {
      return [
        {
          Batch: data.batch.label,
          "Learner Name": learner.displayName,
          Email: learner.email,
          Assessment: moduleMeta?.title ?? "",
          Status: "not started",
          "Score (%)": "",
          Correct: 0,
          "Total Questions": 0,
          "Retakes Used": 0,
          "Date Assigned": "",
          "Invite Emails": 0,
          "Reminder Emails": 0,
          "Guidance Emails": 0,
          "Total Emails Sent": 0,
          "Proctor Warnings": 0,
          "Completion Date": "",
          "Last Activity": "",
        },
      ];
    }

    return assessments.map((a) => ({
      Batch: data.batch.label,
      "Learner Name": learner.displayName,
      Email: learner.email,
      Assessment: a.moduleTitle,
      Status: formatStatus(a.status),
      "Score (%)": a.scorePercent ?? "",
      Correct: a.mcqCorrect,
      "Total Questions": a.mcqTotal,
      "Retakes Used": a.retakeCount,
      "Date Assigned": formatExportDate(a.assignedAt),
      "Invite Emails": a.inviteCount ?? 0,
      "Reminder Emails": a.reminderCount ?? 0,
      "Guidance Emails": a.failedGuidanceCount ?? 0,
      "Total Emails Sent": a.emailsSent ?? 0,
      "Proctor Warnings": a.warningCount ?? 0,
      "Completion Date": formatExportDate(a.completedAt),
      "Last Activity": formatExportDate(
        a.completedAt ?? a.updatedAt ?? a.lastAccessedAt,
      ),
    }));
  });

  const summaryRows = moduleSummary
    ? [
        {
          Batch: data.batch.label,
          Assessment: moduleSummary.title,
          Members: data.batch.memberCount,
          Started: moduleSummary.started,
          Completed: moduleSummary.completed,
          "In Progress": moduleSummary.inProgress,
          "Not Started": moduleSummary.notStarted,
          Failed: moduleSummary.failed,
          "Avg Score (%)": moduleSummary.avgScore ?? "",
          "Pass Rate (%)": moduleSummary.passRate ?? "",
          "Compliance (%)": moduleSummary.compliance,
        },
      ]
    : [
        {
          Batch: data.batch.label,
          Members: data.batch.memberCount,
          "Modules Assigned": data.summary.modulesAssigned,
          Started: data.summary.learnersStarted,
          Completed: data.summary.completed,
          "In Progress": data.summary.inProgress,
          "Avg Score (%)": data.summary.avgScore ?? "",
          "Pass Rate (%)": data.summary.passRate ?? "",
          "Compliance (%)": data.summary.compliance,
        },
      ];

  const summaryCsv = Papa.unparse(summaryRows as Record<string, string | number>[]);
  const rowsCsv = Papa.unparse(rows);

  const title = moduleId
    ? "Relanto — Module Performance Export"
    : "Relanto — Batch Performance Export";

  const csv = [
    title,
    `Generated: ${formatExportDate(data.generatedAt)}`,
    ...(moduleId ? [`Module: ${moduleMeta?.title ?? moduleId}`] : []),
    `Batch: ${data.batch.label}`,
    "",
    moduleId ? "MODULE SUMMARY" : "BATCH SUMMARY",
    summaryCsv,
    "",
    "LEARNER RESULTS",
    rowsCsv,
  ].join("\n");

  const batchSlug = slugify(data.batch.label) || data.batch.id;
  const moduleSlug = moduleMeta ? slugify(moduleMeta.title) : "all";
  const date = new Date().toISOString().slice(0, 10);
  const filename = moduleId
    ? `marks-${batchSlug}-${moduleSlug}-${date}.csv`
    : `marks-${batchSlug}-all-${date}.csv`;

  // UTF-8 BOM so Excel opens columns/accents correctly.
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(filename, blob);
}

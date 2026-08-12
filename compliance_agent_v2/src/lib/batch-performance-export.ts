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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Human-readable datetime that Excel will not turn into a serial date
 * (which shows as ######## when the column is narrow).
 */
function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? "PM" : "AM";
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hours12}:${pad(d.getMinutes())} ${ampm}`;
}

/** Force Excel to treat the cell as text (avoids ######## date display). */
function excelText(value: string): string {
  if (!value) return "";
  return `="${value.replace(/"/g, '""')}"`;
}

function emailCell(
  available: boolean | undefined,
  count: number | null | undefined,
): string | number {
  if (!available) return "Not available";
  return Number(count ?? 0);
}

type LearnerExportRow = {
  Batch: string;
  "Learner Name": string;
  Email: string;
  Assessment: string;
  Status: string;
  "Score (%)": string | number;
  Correct: number;
  "Total Questions": number;
  "Retakes Used": number;
  "Date Assigned": string;
  "Invite Emails": string | number;
  "Reminder Emails": string | number;
  "Guidance Emails": string | number;
  "Total Emails Sent": string | number;
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
          "Invite Emails": "Not available",
          "Reminder Emails": "Not available",
          "Guidance Emails": "Not available",
          "Total Emails Sent": "Not available",
          "Proctor Warnings": 0,
          "Completion Date": "",
          "Last Activity": "",
        },
      ];
    }

    return assessments.map((a) => {
      const lastActivityIso =
        a.lastAccessedAt ?? a.updatedAt ?? a.completedAt ?? null;
      return {
        Batch: data.batch.label,
        "Learner Name": learner.displayName,
        Email: learner.email,
        Assessment: a.moduleTitle,
        Status: formatStatus(a.status),
        "Score (%)": a.scorePercent ?? "",
        Correct: a.mcqCorrect,
        "Total Questions": a.mcqTotal,
        "Retakes Used": a.retakeCount,
        "Date Assigned": excelText(formatExportDate(a.assignedAt)),
        "Invite Emails": emailCell(a.emailHistoryAvailable, a.inviteCount),
        "Reminder Emails": emailCell(a.emailHistoryAvailable, a.reminderCount),
        "Guidance Emails": emailCell(
          a.emailHistoryAvailable,
          a.failedGuidanceCount,
        ),
        "Total Emails Sent": emailCell(a.emailHistoryAvailable, a.emailsSent),
        "Proctor Warnings": a.warningCount ?? 0,
        "Completion Date": excelText(formatExportDate(a.completedAt)),
        "Last Activity": excelText(formatExportDate(lastActivityIso)),
      };
    });
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

  const summaryCsv = Papa.unparse(
    summaryRows as Record<string, string | number>[],
  );
  const rowsCsv = Papa.unparse(rows);

  const title = moduleId
    ? "Relanto — Module Performance Export"
    : "Relanto — Batch Performance Export";

  const csv = [
    title,
    `Generated: ${formatExportDate(data.generatedAt)}`,
    ...(moduleId ? [`Module: ${moduleMeta?.title ?? moduleId}`] : []),
    `Batch: ${data.batch.label}`,
    "Note: Email columns show Not available when invite/reminder history was not logged for this module (common for older assignments). New assignments record email history going forward.",
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

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(filename, blob);
}

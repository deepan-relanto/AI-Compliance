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
  if (status === "failed" || status === "permanently_failed") return "locked";
  return status.replace(/_/g, " ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * IST timestamps so Excel does not depend on the admin's browser timezone.
 * Prefixed as text so Excel will not turn the value into a serial date.
 */
function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const year = pick("year");
  const hour = pick("hour");
  const minute = pick("minute");
  const dayPeriod = pick("dayPeriod").toUpperCase();
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod} IST`;
}

function excelText(value: string): string {
  if (!value) return "";
  return `="${value.replace(/"/g, '""')}"`;
}

function dateCell(iso: string | null | undefined): string {
  return excelText(formatExportDate(iso));
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
  "Date Assigned": string;
  "Date Started": string;
  "Completion Date": string;
  "Last Activity": string;
  "Retakes Used (attempts)": number;
  "Retake Emails Sent": number;
  "Last Retake Email": string;
  "Invite Emails": number;
  "Last Invite Sent": string;
  "Reminder Emails": number;
  "Last Reminder Sent": string;
  "Guidance Emails": number;
  "Last Guidance Sent": string;
  "Total Emails Sent": number;
  "Proctor Warnings": number;
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
          "Date Assigned": "",
          "Date Started": "",
          "Completion Date": "",
          "Last Activity": "",
          "Retakes Used (attempts)": 0,
          "Retake Emails Sent": 0,
          "Last Retake Email": "",
          "Invite Emails": 0,
          "Last Invite Sent": "",
          "Reminder Emails": 0,
          "Last Reminder Sent": "",
          "Guidance Emails": 0,
          "Last Guidance Sent": "",
          "Total Emails Sent": 0,
          "Proctor Warnings": 0,
        },
      ];
    }

    return assessments.map((a) => {
      const lastActivityIso =
        a.lastAccessedAt ?? a.updatedAt ?? a.completedAt ?? null;
      const startedIso =
        a.status === "not_started" ? null : (a.startedAt ?? lastActivityIso);
      return {
        Batch: data.batch.label,
        "Learner Name": learner.displayName,
        Email: learner.email,
        Assessment: a.moduleTitle,
        Status: formatStatus(a.status),
        "Score (%)": a.scorePercent ?? "",
        Correct: a.mcqCorrect,
        "Total Questions": a.mcqTotal,
        "Date Assigned": dateCell(a.assignedAt),
        "Date Started": dateCell(startedIso),
        "Completion Date": dateCell(a.completedAt),
        "Last Activity": dateCell(lastActivityIso),
        "Retakes Used (attempts)": a.retakeCount,
        "Retake Emails Sent": a.retakeEmailCount ?? 0,
        "Last Retake Email": dateCell(a.lastRetakeEmailAt),
        "Invite Emails": a.inviteCount ?? 0,
        "Last Invite Sent": dateCell(a.lastInvitedAt),
        "Reminder Emails": a.reminderCount ?? 0,
        "Last Reminder Sent": dateCell(a.lastRemindedAt),
        "Guidance Emails": a.failedGuidanceCount ?? 0,
        "Last Guidance Sent": dateCell(a.lastFailedGuidanceAt),
        "Total Emails Sent": a.emailsSent ?? 0,
        "Proctor Warnings": a.warningCount ?? 0,
      };
    });
  });

  const totalReminders = rows.reduce((n, r) => n + r["Reminder Emails"], 0);
  const totalRetakeEmails = rows.reduce((n, r) => n + r["Retake Emails Sent"], 0);
  const totalInvites = rows.reduce((n, r) => n + r["Invite Emails"], 0);
  const totalGuidance = rows.reduce((n, r) => n + r["Guidance Emails"], 0);

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
          Locked: moduleSummary.failed,
          "Avg Score (%)": moduleSummary.avgScore ?? "",
          "Pass Rate (%)": moduleSummary.passRate ?? "",
          "Seat completion (%)": moduleSummary.compliance,
          "Invite emails": totalInvites,
          "Reminder emails": totalReminders,
          "Guidance emails": totalGuidance,
          "Retake emails": totalRetakeEmails,
        },
      ]
    : [
        {
          Batch: data.batch.label,
          Members: data.batch.memberCount,
          "Modules Assigned": data.summary.modulesAssigned,
          Seats:
            data.batch.memberCount * Math.max(0, data.summary.modulesAssigned),
          "Seats Complete": data.summary.completed,
          "People started (any course)": data.summary.learnersStarted,
          Completed: data.summary.completed,
          "In Progress": data.summary.inProgress,
          Locked: data.summary.failed ?? 0,
          "Not Started": data.summary.notStarted ?? "",
          "Avg Score (%)": data.summary.avgScore ?? "",
          "Pass Rate (%)": data.summary.passRate ?? "",
          "Seat completion (%)": data.summary.compliance,
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
    "Dates are India Standard Time (IST).",
    "Date Assigned is when this learner got this course in this batch (later of joining the batch and the first invite wave). It is not the course created date.",
    "Retakes Used (attempts) is how many times they retook the quiz. Retake Emails Sent is how many retake-approval emails we sent, with Last Retake Email as the most recent send.",
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

import type { AnalyticsPayload } from "@/lib/analytics-types";
import Papa from "papaparse";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAnalyticsCsv(data: AnalyticsPayload) {
  const historyRows = data.history.map((r) => ({
    learner: r.userEmail,
    assessment: r.moduleTitle,
    batch: r.batchLabel,
    status: r.status,
    score_percent: r.scorePercent ?? "",
    mcq_correct: r.mcqCorrect,
    mcq_total: r.mcqTotal,
    retakes: r.retakeCount,
    completed_at: r.completedAt ?? "",
    updated_at: r.updatedAt,
  }));

  const batchRows = data.batches.map((b) => ({
    batch: b.label,
    members: b.memberCount,
    learners_started: b.learnersStarted,
    progress_records: b.totalAttempts,
    completed: b.completed,
    failed: b.failed,
    in_progress: b.inProgress,
    compliance_percent: b.compliance,
    avg_score: b.avgScore ?? "",
    pass_rate: b.passRate ?? "",
  }));

  const csv = [
    "# Compliance Agent — Analytics Export",
    `# Generated: ${data.generatedAt}`,
    "",
    "## Batch Summary",
    Papa.unparse(batchRows),
    "",
    "## Learner History",
    Papa.unparse(historyRows),
  ].join("\n");

  downloadBlob(
    `compliance-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
}

export function exportAnalyticsPdf(data: AnalyticsPayload) {
  const { summary } = data;
  const batchRows = data.batches
    .map(
      (b) =>
        `<tr>
          <td>${escapeHtml(b.label)}</td>
          <td>${b.memberCount}</td>
          <td>${b.learnersStarted}</td>
          <td>${b.compliance}%</td>
          <td>${b.passRate ?? "—"}%</td>
          <td>${b.avgScore ?? "—"}%</td>
        </tr>`,
    )
    .join("");

  const historyRows = data.history
    .slice(0, 50)
    .map(
      (r) =>
        `<tr>
          <td>${escapeHtml(r.userEmail)}</td>
          <td>${escapeHtml(r.moduleTitle)}</td>
          <td>${escapeHtml(r.batchLabel)}</td>
          <td>${escapeHtml(r.status.replace(/_/g, " "))}</td>
          <td>${r.scorePercent != null ? `${r.scorePercent}%` : "—"}</td>
          <td>${formatDate(r.completedAt ?? r.updatedAt)}</td>
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Compliance Analytics Report</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #18181b; padding: 32px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #71717a; font-size: 13px; margin-bottom: 24px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .kpi { border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; }
    .kpi label { font-size: 11px; text-transform: uppercase; color: #71717a; }
    .kpi value { display: block; font-size: 24px; font-weight: 600; margin-top: 4px; }
    h2 { font-size: 15px; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
    th, td { border: 1px solid #e4e4e7; padding: 8px; text-align: left; }
    th { background: #f4f4f5; font-weight: 600; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>Relanto Compliance Analytics</h1>
  <p class="meta">Generated ${formatDate(data.generatedAt)} · Organization-wide report</p>

  <div class="kpis">
    <div class="kpi"><label>Learners</label><value>${summary.totalLearners}</value></div>
    <div class="kpi"><label>Completed</label><value>${summary.completedCount}</value></div>
    <div class="kpi"><label>Avg. score</label><value>${summary.avgScore ?? "—"}${summary.avgScore != null ? "%" : ""}</value></div>
    <div class="kpi"><label>Pass rate</label><value>${summary.passRate ?? "—"}${summary.passRate != null ? "%" : ""}</value></div>
  </div>

  <h2>Batch comparison</h2>
  <table>
    <thead><tr><th>Batch</th><th>Members</th><th>Started</th><th>Compliance</th><th>Pass rate</th><th>Avg score</th></tr></thead>
    <tbody>${batchRows || "<tr><td colspan='6'>No batch data</td></tr>"}</tbody>
  </table>

  <h2>Recent learner activity</h2>
  <table>
    <thead><tr><th>Learner</th><th>Assessment</th><th>Batch</th><th>Status</th><th>Score</th><th>Date</th></tr></thead>
    <tbody>${historyRows || "<tr><td colspan='6'>No activity yet</td></tr>"}</tbody>
  </table>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Allow pop-ups to export the PDF report, then use Print → Save as PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

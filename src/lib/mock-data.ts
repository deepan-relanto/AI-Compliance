/** Placeholder AI insight copy per batch until Gemini reports are wired. */
export function getAiReportForBatch(batchId: string): string {
  if (batchId === "relanto_team_1") {
    return `## Relanto Team 1

**Overall compliance** is tracked from live learner sessions. Upload assessments and assign them to this batch to begin collecting data.

**Recommended:** Review integrity warnings in Monitoring after the first assessment week.`;
  }
  if (batchId === "relanto_team_2") {
    return `## Relanto Team 2

**Learner progress** — use batch analytics to compare pass rates and average scores across modules.

**Recommended:** Export progress CSV before quarterly compliance reviews.`;
  }
  if (batchId === "relanto_team_3") {
    return `## Relanto Team 3

**Admin test cohort** — use this batch to validate new modules before rolling out to wider teams.

**Recommended:** Run a full proctored session end-to-end before publishing to Team 1 or Team 2.`;
  }
  if (batchId === "relanto_team_4") {
    return `## Relanto Team 4

**Compliance tracking** for this cohort — assign modules and monitor completion from the analytics dashboard.

**Recommended:** Send training invites after publishing and reviewing module checkpoints.`;
  }
  if (batchId === "relanto_team_5") {
    return `## Relanto Team 5

**Compliance tracking** for this cohort — assign modules and monitor completion from the analytics dashboard.

**Recommended:** Send training invites after publishing and reviewing module checkpoints.`;
  }
  if (batchId === "relanto_leaders") {
    return `## Relanto Leaders

**Leadership cohort** — assign modules and monitor completion from the analytics dashboard.

**Recommended:** Send training invites after publishing and reviewing module checkpoints.`;
  }
  return `## Training batch

**Compliance data** will appear here once learners complete assigned modules.

**Recommended:** Assign published modules from the content library and monitor progress on the analytics dashboard.`;
}

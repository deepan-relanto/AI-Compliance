import {
  isPassingScore,
  PASS_THRESHOLD_PERCENT,
  POINTS_PER_MCQ,
} from "@/lib/constants";

export interface CompletionResultSummary {
  moduleTitle: string;
  scorePercent: number;
  passed: boolean;
  mcqCorrect: number;
  mcqTotal: number;
}

interface EmailBadge {
  name: string;
  description: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function motivationalMessage(scorePercent: number): string {
  if (scorePercent >= 90) {
    return "Outstanding performance. You demonstrated expert compliance judgment.";
  }
  if (scorePercent >= 80) {
    return "Excellent work. Your answers show strong understanding of the material.";
  }
  if (scorePercent >= PASS_THRESHOLD_PERCENT) {
    return "Good job. You met the required passing threshold.";
  }
  return "More review is needed. Revisit the material and attempt the assessment again.";
}

function earnedBadgesForEmail(summary: CompletionResultSummary): EmailBadge[] {
  const badges: EmailBadge[] = [];
  const { scorePercent, mcqCorrect, mcqTotal } = summary;

  if (mcqCorrect > 0) {
    badges.push({
      name: "Compliance Starter",
      description: "First checkpoint completed.",
    });
  }

  const progressPercent =
    mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : scorePercent;
  if (progressPercent >= 50) {
    badges.push({
      name: "50% Milestone",
      description: "You're halfway through this training module.",
    });
  }

  if (scorePercent >= 80) {
    badges.push({
      name: "Compliance Champion",
      description: "Scored 80% or above.",
    });
  }

  if (scorePercent === 100) {
    badges.push({
      name: "Perfect Performer",
      description: "Scored 100%.",
    });
  }

  return badges;
}

function statCell(label: string, value: string): string {
  return `
    <td width="50%" style="width:50%;padding:5px;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e4e4e7;background:#fafafa;">
        <tr>
          <td style="padding:12px 14px;text-align:left;">
            <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-family:Segoe UI,Arial,sans-serif;">${label}</p>
            <p style="margin:8px 0 0;font-family:Segoe UI,Arial,sans-serif;font-size:20px;font-weight:700;line-height:1.2;color:#18181b;">${value}</p>
          </td>
        </tr>
      </table>
    </td>`;
}

function badgeBlock(badge: EmailBadge): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;border:1px solid #fde68a;background:#fffbeb;">
      <tr>
        <td style="padding:10px 12px;">
          <p style="margin:0;font-size:12px;font-weight:700;color:#78350f;font-family:Segoe UI,Arial,sans-serif;">${escapeHtml(badge.name)}</p>
          <p style="margin:4px 0 0;font-size:11px;line-height:1.45;color:#92400e;font-family:Segoe UI,Arial,sans-serif;">${escapeHtml(badge.description)}</p>
        </td>
      </tr>
    </table>`;
}

/** Progress ring image for email (use cid: or hosted PNG — never inline SVG). */
function scoreRingHtml(
  scorePercent: number,
  passed: boolean,
  imageSrc: string,
): string {
  const clamped = Math.min(100, Math.max(0, Math.round(scorePercent)));
  const statusLabel = passed ? "PASS" : "FAIL";
  const safeSrc = escapeHtml(imageSrc);
  const alt = escapeHtml(`${clamped}% ${statusLabel}`);

  return `
    <table cellpadding="0" cellspacing="0" role="presentation" align="right">
      <tr>
        <td align="right" valign="top" width="128" height="128" style="width:128px;height:128px;padding:0;line-height:0;font-size:0;">
          <img src="${safeSrc}" width="128" height="128" alt="${alt}" style="display:block;width:128px;height:128px;max-width:128px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>
        </td>
      </tr>
    </table>`;
}

export interface CompletionResultEmailOptions {
  scoreRingImageSrc: string;
}

/** Email-safe HTML card mirroring the in-app Final Result screen (no action button). */
export function completionResultSummaryHtml(
  summary: CompletionResultSummary,
  options: CompletionResultEmailOptions,
): string {
  const moduleTitle = escapeHtml(summary.moduleTitle);
  const scorePercent = Math.min(100, Math.max(0, Math.round(summary.scorePercent)));
  const passed = summary.passed;
  const finalScore = summary.mcqCorrect * POINTS_PER_MCQ;
  const totalScore = Math.max(summary.mcqTotal, 1) * POINTS_PER_MCQ;
  const wrongAnswers = Math.max(0, summary.mcqTotal - summary.mcqCorrect);
  const badges = earnedBadgesForEmail(summary);

  const headerBg = passed ? "#ecfdf5" : "#fef2f2";
  const headerBorder = passed ? "#d1fae5" : "#fecaca";
  const accent = passed ? "#2e3192" : "#b91c1c";
  const scoreRingImageSrc = options.scoreRingImageSrc;

  const badgeHtml =
    badges.length > 0
      ? badges.map(badgeBlock).join("")
      : `<p style="margin:0;font-size:13px;color:#71717a;font-family:Segoe UI,Arial,sans-serif;">No badges unlocked for this attempt.</p>`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;border:1px solid #e4e4e7;background:#ffffff;">
      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${headerBg};border-bottom:1px solid ${headerBorder};">
            <tr>
              <td style="padding:24px;font-family:Segoe UI,Arial,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td valign="top" style="padding-right:12px;">
                      <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accent};">
                        <span style="display:inline-block;padding:5px 10px;border:1px solid ${headerBorder};background:#ffffff;">Final result</span>
                      </p>
                      <h2 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;line-height:1.25;">
                        ${passed ? "Congratulations!" : "Compliance Training Failed"}
                      </h2>
                      <p style="margin:0 0 6px;font-size:14px;line-height:1.55;color:#3f3f46;">
                        ${
                          passed
                            ? "You have successfully completed the training."
                            : `You did not achieve the minimum passing score of ${PASS_THRESHOLD_PERCENT}%. Please review the material and try again.`
                        }
                      </p>
                      <p style="margin:0;font-size:14px;font-weight:600;color:#18181b;line-height:1.5;">
                        ${escapeHtml(motivationalMessage(scorePercent))}
                      </p>
                    </td>
                    <td width="132" valign="top" align="right" style="width:132px;min-width:132px;">
                      ${scoreRingHtml(scorePercent, passed, scoreRingImageSrc)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding:20px 24px 12px;font-family:Segoe UI,Arial,sans-serif;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#2e3192;">Assessment Summary</p>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#52525b;">
                  You scored ${finalScore}/${totalScore} in ${moduleTitle}.
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:14px;table-layout:fixed;">
                  <tr>
                    ${statCell("Final Score", `${finalScore}/${totalScore}`)}
                    ${statCell("Percentage", `${scorePercent}%`)}
                  </tr>
                  <tr>
                    ${statCell("Status", passed ? "PASS" : "FAIL")}
                    ${statCell("Correct Answers", String(summary.mcqCorrect))}
                  </tr>
                  <tr>
                    ${statCell("Wrong Answers", String(wrongAnswers))}
                    ${statCell("Passing Threshold", `${PASS_THRESHOLD_PERCENT}%`)}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 24px 20px;border-top:1px solid #f4f4f5;font-family:Segoe UI,Arial,sans-serif;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#b45309;">Badges Earned</p>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;">
                  <tr>
                    <td>
                      ${badgeHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function completionResultTextSummary(summary: CompletionResultSummary): string {
  const finalScore = summary.mcqCorrect * POINTS_PER_MCQ;
  const totalScore = Math.max(summary.mcqTotal, 1) * POINTS_PER_MCQ;
  const wrongAnswers = Math.max(0, summary.mcqTotal - summary.mcqCorrect);
  const badges = earnedBadgesForEmail(summary)
    .map((b) => `- ${b.name}: ${b.description}`)
    .join("\n");

  return [
    summary.passed ? "Congratulations!" : "Compliance Training Failed",
    `Score: ${finalScore}/${totalScore} (${summary.scorePercent}%)`,
    `Status: ${summary.passed ? "PASS" : "FAIL"}`,
    `Correct: ${summary.mcqCorrect} | Wrong: ${wrongAnswers}`,
    badges ? `Badges:\n${badges}` : "Badges: none",
  ].join("\n");
}

export function buildCompletionResultSummary(params: {
  moduleTitle: string;
  scorePercent: number | null;
  mcqCorrect: number | null;
  mcqTotal: number | null;
}): CompletionResultSummary | null {
  const mcqTotal = params.mcqTotal ?? 0;
  const mcqCorrect = params.mcqCorrect ?? 0;
  if (params.scorePercent == null && mcqTotal === 0) {
    return null;
  }

  let scorePercent = params.scorePercent;
  if (scorePercent == null && mcqTotal > 0) {
    scorePercent = Math.round((mcqCorrect / mcqTotal) * 100);
  }
  if (scorePercent == null) {
    return null;
  }

  return {
    moduleTitle: params.moduleTitle,
    scorePercent,
    passed: isPassingScore(scorePercent),
    mcqCorrect,
    mcqTotal: Math.max(mcqTotal, 1),
  };
}

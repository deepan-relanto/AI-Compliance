import type { getSql } from "@/lib/db";
import { getGraphMailConfig } from "@/lib/graph-mail-config";
import { firstNameFromEmail } from "@/lib/auth-env";
import {
  buildCompletionResultSummary,
  completionResultSummaryHtml,
  completionResultTextSummary,
  escapeHtml,
} from "@/lib/services/completion-result-email-html";
import {
  buildScoreRingPngBuffer,
  SCORE_RING_IMAGE_CID,
} from "@/lib/services/score-ring-image";
import { sendGraphMail } from "@/lib/services/graph-mail-service";
import { normalizeProgressStatus } from "@/lib/services/course-progress-db-service";
import { trainingLoginUrl } from "@/lib/training-link";

type Sql = ReturnType<typeof getSql>;
type MailKind = "compliance" | "course";

async function isCourseModule(sql: Sql, moduleId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  return rows.length > 0;
}

const COMPLIANCE_DURATION_LABEL = "approximately 15 min";
const COURSE_DURATION_FALLBACK_MIN = 30;
const ONE_STRETCH_NOTE =
  "To ensure a seamless learning experience, the training should be completed in one uninterrupted session.";
const COURSE_ONE_STRETCH_NOTE =
  "To get the most from it, please complete the course in one uninterrupted session.";

/** Plain-text guidelines included in course start invites. */
const COURSE_INVITE_GUIDELINES_TEXT = [
  "Critical Guidelines: Read Before Starting",
  "1. Saving Your Work: Feel free to pause and resume during the learning modules. Note: Once the final quiz starts, Save & Exit is disabled. Leaving the quiz early marks it as a failed attempt.",
  "2. Session Integrity & Proctoring: This course uses active monitoring. Please remain in full-screen mode and do not switch browser tabs.",
  "3. 3-Warning Limit: Hitting 3 system warnings will automatically lock your account for this attempt. If locked, submit a review request to receive a new retake link.",
].join("\n\n");

/**
 * Outlook-safe guidelines block for course start invites (tables + inline CSS).
 * Placed above the Start course CTA.
 */
function courseInviteGuidelinesHtml(): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 8px;border-collapse:collapse;">
    <tr>
      <td style="background-color:#f4f4f5;border:1px solid #e4e4e7;border-left:4px solid #2e3192;padding:16px 18px;">
        <p style="margin:0 0 12px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;color:#18181b;line-height:1.4;">Critical Guidelines: Read Before Starting</p>
        <p style="margin:0 0 10px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.55;">
          <strong style="color:#18181b;">1. Saving Your Work</strong><br />
          Feel free to pause and resume during the learning modules. Note: Once the final quiz starts, Save &amp; Exit is disabled. Leaving the quiz early marks it as a failed attempt.
        </p>
        <p style="margin:0 0 10px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.55;">
          <strong style="color:#18181b;">2. Session Integrity &amp; Proctoring</strong><br />
          This course uses active monitoring. Please remain in full-screen mode and do not switch browser tabs.
        </p>
        <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.55;">
          <strong style="color:#18181b;">3. 3-Warning Limit</strong><br />
          Hitting 3 system warnings will automatically lock your account for this attempt. If locked, submit a review request to receive a new retake link.
        </p>
      </td>
    </tr>
  </table>`;
}

function courseDurationLabel(minutes: number | null | undefined): string {
  const mins =
    typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : COURSE_DURATION_FALLBACK_MIN;
  return `approximately ${mins} min`;
}

/**
 * Bulletproof CTA that survives Outlook desktop's dark-mode color inversion.
 *
 * -Windows Outlook: uses VML roundrect (native Word rendering engine honors
 *   fillcolor/color literally and is NOT touched by dark mode).
 * -Every other client (Outlook web, Gmail, Apple Mail, mobile): sees the
 *   `<a>` fallback (Outlook desktop skips it via `mso-hide:all`).
 */
function ctaButtonHtml(loginUrl: string, label: string): string {
  const safeLabel = escapeHtml(label);
  // Approximate VML width - Outlook can't size a roundrect by padding.
  const vmlWidth = Math.max(140, Math.min(220, label.length * 11 + 44));
  return `
  <div style="margin:24px 0;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${loginUrl}" style="height:46px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="12%" strokecolor="#25277a" strokeweight="1px" fillcolor="#2e3192">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.01em;">${safeLabel}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${loginUrl}" target="_blank" style="background-color:#2e3192;border:1px solid #25277a;border-radius:6px;color:#ffffff !important;display:inline-block;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.01em;line-height:46px;mso-hide:all;padding:0 28px;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;mso-line-height-rule:exactly;">${safeLabel}</a>
    <!--<![endif]-->
  </div>`;
}

function invitationHtml(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
  durationLabel: string;
}): string {
  const { displayName, moduleTitle, loginUrl, kind, durationLabel } = params;
  if (kind === "course") {
    return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto AI Course</p>
  <h1 style="font-size:22px;margin:8px 0 16px">New AI course assigned</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Your administrator has assigned <strong>${escapeHtml(moduleTitle)}</strong> to you. This is a Relanto AI learning course (${durationLabel}).</p>
  <p style="font-size:13px;color:#52525b;margin-bottom:0;">Before you begin, Please review the guidelines below, then start when you are ready.</p>
  ${courseInviteGuidelinesHtml()}
  ${ctaButtonHtml(loginUrl, "Start course")}
  <p style="font-size:13px;color:#71717a;margin-bottom:6px">Sign in with your @relanto.ai Microsoft work account to begin.</p>
  <p style="font-size:12px;color:#71717a">In case of any technical issues, please contact Relanto Academy at <a href="mailto:relanto.academy@relanto.ai" style="color:#2e3192;text-decoration:underline">relanto.academy@relanto.ai</a></p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - AI Course</p>
</body></html>`;
  }

  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Mandatory training assigned</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Your administrator has sent <strong>${escapeHtml(moduleTitle)}</strong> to you. This is a proctored compliance assessment (${durationLabel}).</p>
  <p style="font-size:13px;color:#52525b">${ONE_STRETCH_NOTE}</p>
  ${ctaButtonHtml(loginUrl, "Start training")}
  <p style="font-size:13px;color:#71717a;margin-bottom:6px">Sign in with your @relanto.ai Microsoft work account to begin.</p>
  <p style="font-size:12px;color:#71717a">In case of any technical issues, please contact Relanto Academy at <a href="mailto:relanto.academy@relanto.ai" style="color:#2e3192;text-decoration:underline">relanto.academy@relanto.ai</a></p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - Compliance Agent</p>
</body></html>`;
}

function invitationTextBody(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
  durationLabel: string;
}): string {
  const { displayName, moduleTitle, loginUrl, kind, durationLabel } = params;
  if (kind === "course") {
    return [
      `Hi ${displayName},`,
      `Your administrator has assigned "${moduleTitle}" to you. This is a Relanto AI learning course (${durationLabel}).`,
      "Before you begin, Please review the guidelines below, then start when you are ready.",
      COURSE_INVITE_GUIDELINES_TEXT,
      `Start course: ${loginUrl}`,
      "Sign in with your @relanto.ai Microsoft work account to begin.",
    ].join("\n\n");
  }
  return [
    `Hi ${displayName},`,
    `Your administrator has sent "${moduleTitle}" to you. This is a proctored compliance assessment (${durationLabel}).`,
    ONE_STRETCH_NOTE,
    `Start here: ${loginUrl}`,
    "Sign in with your @relanto.ai Microsoft work account to begin.",
  ].join("\n\n");
}

function reminderHtml(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
  durationLabel: string;
}): string {
  const { displayName, moduleTitle, loginUrl, kind, durationLabel } = params;
  if (kind === "course") {
    return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto AI Course</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Friendly reminder to start your course</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>This is a friendly reminder to begin <strong>${escapeHtml(moduleTitle)}</strong>. It is available in your Relanto AI learning queue and takes ${durationLabel}.</p>
  <p style="font-size:13px;color:#52525b">Please start it when you next have a focused stretch of time so you can complete it smoothly in one sitting.</p>
  ${ctaButtonHtml(loginUrl, "Start course")}
  <p style="font-size:13px;color:#71717a;margin-bottom:6px">Sign in with your @relanto.ai Microsoft work account to begin.</p>
  <p style="font-size:12px;color:#71717a">If you run into access issues, please contact Relanto Academy at <a href="mailto:relanto.academy@relanto.ai" style="color:#2e3192;text-decoration:underline">relanto.academy@relanto.ai</a></p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - AI Course</p>
</body></html>`;
  }

  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Friendly reminder to start your training</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>This is a friendly reminder to begin <strong>${escapeHtml(moduleTitle)}</strong>. It is a proctored compliance assessment (${durationLabel}) waiting in your learning queue.</p>
  <p style="font-size:13px;color:#52525b">Please start it when you next have a focused stretch of time so you can complete it smoothly in one sitting.</p>
  ${ctaButtonHtml(loginUrl, "Start training")}
  <p style="font-size:13px;color:#71717a;margin-bottom:6px">Sign in with your @relanto.ai Microsoft work account to begin.</p>
  <p style="font-size:12px;color:#71717a">If you run into access issues, please contact Relanto Academy at <a href="mailto:relanto.academy@relanto.ai" style="color:#2e3192;text-decoration:underline">relanto.academy@relanto.ai</a></p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - Compliance Agent</p>
</body></html>`;
}

function reminderTextBody(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
  durationLabel: string;
}): string {
  const { displayName, moduleTitle, loginUrl, kind, durationLabel } = params;
  if (kind === "course") {
    return [
      `Hi ${displayName},`,
      `This is a friendly reminder to begin "${moduleTitle}". It is available in your Relanto AI learning queue and takes ${durationLabel}.`,
      "Please start it when you next have a focused stretch of time so you can complete it smoothly in one sitting.",
      `Start course: ${loginUrl}`,
      "Sign in with your @relanto.ai Microsoft work account to begin.",
    ].join("\n\n");
  }
  return [
    `Hi ${displayName},`,
    `This is a friendly reminder to begin "${moduleTitle}". It is a proctored compliance assessment (${durationLabel}) waiting in your learning queue.`,
    "Please start it when you next have a focused stretch of time so you can complete it smoothly in one sitting.",
    `Start training: ${loginUrl}`,
    "Sign in with your @relanto.ai Microsoft work account to begin.",
  ].join("\n\n");
}

function completionHtml(params: {
  displayName: string;
  moduleTitle: string;
  resultSummaryHtml?: string;
  kind: MailKind;
}): string {
  const { displayName, moduleTitle, resultSummaryHtml = "", kind } = params;
  const safeName = escapeHtml(displayName);
  const safeTitle = escapeHtml(moduleTitle);
  if (kind === "course") {
    return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:640px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto AI Course</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Course completed</h1>
  <p>Hi ${safeName},</p>
  <p>We received your completed AI course for <strong>${safeTitle}</strong>, including your attestation and feedback.</p>
  ${resultSummaryHtml}
  <p style="color:#52525b">No further action is required. Thank you for completing your AI course.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - AI Course</p>
</body></html>`;
  }
  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:640px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Training submitted</h1>
  <p>Hi ${safeName},</p>
  <p>We received your completed assessment for <strong>${safeTitle}</strong>, including your attestation and feedback.</p>
  ${resultSummaryHtml}
  <p style="color:#52525b">No further action is required. Thank you for completing your mandatory training.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - Compliance Agent</p>
</body></html>`;
}

function completionTextBody(params: {
  displayName: string;
  moduleTitle: string;
  resultSummaryText?: string;
  kind: MailKind;
}): string {
  const { displayName, moduleTitle, resultSummaryText, kind } = params;
  if (kind === "course") {
    return [
      `Hi ${displayName},`,
      `We received your completed AI course for "${moduleTitle}", including your attestation and feedback.`,
      resultSummaryText,
      "No further action is required. Thank you for completing your AI course.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    `Hi ${displayName},`,
    `We received your completed assessment for "${moduleTitle}", including your attestation and feedback.`,
    resultSummaryText,
    "No further action is required. Thank you for completing your mandatory training.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function retakeHtml(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
  durationLabel: string;
}): string {
  const { displayName, moduleTitle, loginUrl, kind, durationLabel } = params;
  if (kind === "course") {
    return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto AI Course</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Retake approved</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Your administrator approved a new attempt for <strong>${escapeHtml(moduleTitle)}</strong>. Your previous warnings were cleared - you may begin again from the start. This is a Relanto AI learning course (${durationLabel}).</p>
  <p style="font-size:13px;color:#52525b">${COURSE_ONE_STRETCH_NOTE}</p>
  ${ctaButtonHtml(loginUrl, "Start retake")}
  <p style="font-size:13px;color:#71717a">Sign in with your @relanto.ai Microsoft work account to continue.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - AI Course</p>
</body></html>`;
  }
  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Retake approved</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Your administrator approved a new attempt for <strong>${escapeHtml(moduleTitle)}</strong>. Your previous warnings were cleared - you may begin again from the start. This is a proctored compliance assessment (${durationLabel}).</p>
  <p style="font-size:13px;color:#52525b">${ONE_STRETCH_NOTE}</p>
  ${ctaButtonHtml(loginUrl, "Start retake")}
  <p style="font-size:13px;color:#71717a">Sign in with your @relanto.ai Microsoft work account to continue.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">&copy; Relanto - Compliance Agent</p>
</body></html>`;
}

function retakeTextBody(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
  durationLabel: string;
}): string {
  const { displayName, moduleTitle, loginUrl, kind, durationLabel } = params;
  if (kind === "course") {
    return [
      `Hi ${displayName},`,
      `Your administrator approved a new attempt for "${moduleTitle}". Your previous warnings were cleared - you may begin again from the start. This is a Relanto AI learning course (${durationLabel}).`,
      COURSE_ONE_STRETCH_NOTE,
      `Start retake here: ${loginUrl}`,
      "Sign in with your @relanto.ai Microsoft work account to continue.",
    ].join("\n\n");
  }
  return [
    `Hi ${displayName},`,
    `Your administrator approved a new attempt for "${moduleTitle}". Your previous warnings were cleared - you may begin again from the start. This is a proctored compliance assessment (${durationLabel}).`,
    ONE_STRETCH_NOTE,
    `Start retake here: ${loginUrl}`,
    "Sign in with your @relanto.ai Microsoft work account to continue.",
  ].join("\n\n");
}

function failedReviewGuidanceHtml(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
}): string {
  const { displayName, moduleTitle, loginUrl, kind } = params;
  const brand =
    kind === "course" ? "Relanto AI Course" : "Relanto Compliance Agent";
  const noun = kind === "course" ? "course assessment" : "compliance assessment";
  const footer =
    kind === "course" ? "&copy; Relanto - AI Course" : "&copy; Relanto - Compliance Agent";
  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">${brand}</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Action required: request a review</h1>
  <p>Dear ${escapeHtml(displayName)},</p>
  <p>We noted that you were unable to complete <strong>${escapeHtml(moduleTitle)}</strong> under the proctoring requirements for this ${noun}.</p>
  <p>To proceed, please sign in using the link below and submit a <strong>Request Review</strong>. An administrator will assess your request and, where appropriate, authorize a further attempt.</p>
  ${ctaButtonHtml(loginUrl, "Open training &amp; request review")}
  <p style="font-size:13px;color:#71717a;margin-bottom:6px">Sign in with your @relanto.ai Microsoft work account to continue.</p>
  <p style="font-size:12px;color:#71717a">For technical assistance, please contact Relanto Academy at <a href="mailto:relanto.academy@relanto.ai" style="color:#2e3192;text-decoration:underline">relanto.academy@relanto.ai</a>.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">${footer}</p>
</body></html>`;
}

function failedReviewGuidanceTextBody(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  kind: MailKind;
}): string {
  const { displayName, moduleTitle, loginUrl, kind } = params;
  const noun = kind === "course" ? "course assessment" : "compliance assessment";
  return [
    `Dear ${displayName},`,
    `We noted that you were unable to complete "${moduleTitle}" under the proctoring requirements for this ${noun}.`,
    "To proceed, please sign in using the link below and submit a Request Review. An administrator will assess your request and, where appropriate, authorize a further attempt.",
    `Open training and request review: ${loginUrl}`,
    "Sign in with your @relanto.ai Microsoft work account to continue.",
    "For technical assistance, please contact Relanto Academy at relanto.academy@relanto.ai.",
  ].join("\n\n");
}

export interface SendFailedReviewGuidanceOptions {
  forceResend?: boolean;
  batchId?: string;
  triggeredBy?: string;
}

/**
 * Email integrity-failed learners (failed / permanently_failed) with formal
 * guidance to sign in and submit a Request Review.
 */
export async function sendFailedReviewGuidanceEmails(
  sql: Sql,
  moduleId: string,
  options?: SendFailedReviewGuidanceOptions,
): Promise<InvitationSendResult> {
  const forceResend = options?.forceResend === true;
  const batchId = options?.batchId?.trim() || null;
  const triggeredBy = options?.triggeredBy?.trim().toLowerCase() || null;
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: cfg.issues,
      message:
        "Mail not configured - set MAIL_FROM_ADDRESS and ensure Graph Mail.Send consent.",
    };
  }

  const modules = await sql`
    SELECT title, duration_minutes, mcq_generation_status
    FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  const moduleRows =
    modules.length > 0
      ? modules
      : await sql`
          SELECT title, duration_minutes, mcq_generation_status
          FROM training_modules WHERE id = ${moduleId} LIMIT 1
        `;
  if (moduleRows.length === 0) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["Module not found"],
      message: "Module not found",
    };
  }
  if (moduleRows[0].mcq_generation_status !== "completed") {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["Module not ready"],
      message: "Module MCQs are not ready yet.",
    };
  }

  const moduleTitle = moduleRows[0].title as string;
  const loginBase = cfg.baseUrl;
  const isCourse = modules.length > 0;
  const kind: MailKind = isCourse ? "course" : "compliance";
  const subjectBrand = isCourse
    ? "Relanto AI Course"
    : "Relanto Compliance Training";

  const learners = isCourse
    ? await sql`
        SELECT DISTINCT
          u.email,
          u.display_name,
          ub.batch_id AS learner_batch_id,
          cp.status AS progress_status,
          LEAST(cp.score_percent, 100) AS score_percent,
          cp.completed_at,
          cp.last_accessed_at,
          cp.current_slide,
          cp.warning_count,
          cp.mcq_answers
        FROM users u
        INNER JOIN user_batches ub ON LOWER(ub.user_email) = LOWER(u.email)
        INNER JOIN course_module_batches mb ON mb.batch_id = ub.batch_id
        LEFT JOIN course_progress cp
          ON LOWER(cp.user_email) = LOWER(u.email)
          AND cp.module_id = ${moduleId}
          AND cp.batch_id = ub.batch_id
        WHERE mb.module_id = ${moduleId}
          AND (${batchId}::text IS NULL OR ub.batch_id = ${batchId})
          AND u.role = 'user'
          AND u.email IS NOT NULL
        ORDER BY u.email
      `
    : await sql`
        SELECT DISTINCT
          u.email,
          u.display_name,
          ub.batch_id AS learner_batch_id,
          ap.status AS progress_status,
          LEAST(ap.score_percent, 100) AS score_percent,
          ap.completed_at,
          ap.last_accessed_at,
          ap.current_slide,
          ap.warning_count,
          ap.mcq_answers
        FROM users u
        INNER JOIN user_batches ub ON LOWER(ub.user_email) = LOWER(u.email)
        INNER JOIN module_batches mb ON mb.batch_id = ub.batch_id
        LEFT JOIN assessment_progress ap
          ON LOWER(ap.user_email) = LOWER(u.email)
          AND ap.module_id = ${moduleId}
          AND ap.batch_id = ub.batch_id
        WHERE mb.module_id = ${moduleId}
          AND (${batchId}::text IS NULL OR ub.batch_id = ${batchId})
          AND u.role = 'user'
          AND u.email IS NOT NULL
        ORDER BY u.email
      `;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of learners) {
    const email = (row.email as string).trim().toLowerCase();
    const displayName =
      (row.display_name as string | null)?.trim() || firstNameFromEmail(email);

    const rawAnswers =
      row.mcq_answers &&
      typeof row.mcq_answers === "object" &&
      !Array.isArray(row.mcq_answers)
        ? (row.mcq_answers as Record<string, boolean>)
        : {};
    const answerCount = Object.keys(rawAnswers).length;
    const status = normalizeProgressStatus(
      (row.progress_status as string | null) ?? null,
      row.score_percent != null ? Number(row.score_percent) : null,
      (row.completed_at as string | null) ?? null,
      {
        lastAccessedAt: (row.last_accessed_at as string | null) ?? null,
        currentSlide: Number(row.current_slide ?? 0),
        answerCount,
        warningCount: Number(row.warning_count ?? 0),
      },
    );

    if (status !== "failed" && status !== "permanently_failed") {
      skipped++;
      continue;
    }

    if (
      !forceResend &&
      (await wasEventSentToday(sql, moduleId, email, "failed_review_guidance"))
    ) {
      skipped++;
      continue;
    }

    try {
      const loginUrl = trainingLoginUrl(moduleId, loginBase, email);
      await sendGraphMail({
        to: email,
        subject: `Action required: complete your review request - ${moduleTitle} - ${subjectBrand}`,
        htmlBody: failedReviewGuidanceHtml({
          displayName,
          moduleTitle,
          loginUrl,
          kind,
        }),
        textBody: failedReviewGuidanceTextBody({
          displayName,
          moduleTitle,
          loginUrl,
          kind,
        }),
      });
      await recordNotificationEvent(
        sql,
        moduleId,
        email,
        "failed_review_guidance",
        {
          batchId:
            batchId ||
            (typeof row.learner_batch_id === "string"
              ? row.learner_batch_id.trim()
              : "") ||
            null,
          triggeredBy,
        },
      );
      sent++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${email}: ${msg}`);
      console.error("[training-notification failed-guidance]", email, err);
    }
  }

  return {
    ok: failed === 0,
    sent,
    skipped,
    failed,
    errors,
    message:
      sent > 0
        ? `Review-guidance emails sent to ${sent} learner${sent === 1 ? "" : "s"}.`
        : failed > 0
          ? `Failed to send ${failed} review-guidance email(s).`
          : skipped > 0
            ? "No eligible failed learners matched this outreach (or already contacted today)."
            : batchId
              ? "No learners found in the selected batch."
              : "No learners found in assigned batches.",
  };
}

async function wasNotificationSent(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: "invited" | "completed",
): Promise<boolean> {
  const isCourse = await isCourseModule(sql, moduleId);
  const rows = isCourse
    ? await sql`
        SELECT 1 FROM course_notifications
        WHERE module_id = ${moduleId}
          AND LOWER(user_email) = LOWER(${userEmail})
          AND notification_type = ${type}
        LIMIT 1
      `
    : await sql`
        SELECT 1 FROM training_notifications
        WHERE module_id = ${moduleId}
          AND LOWER(user_email) = LOWER(${userEmail})
          AND notification_type = ${type}
        LIMIT 1
      `;
  return rows.length > 0;
}

export type NotificationEventType =
  | "invited"
  | "completed"
  | "reminder"
  | "failed_review_guidance"
  | "retake_approved";

async function recordNotification(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: "invited" | "completed",
): Promise<void> {
  const isCourse = await isCourseModule(sql, moduleId);
  if (isCourse) {
    await sql`
      INSERT INTO course_notifications (module_id, user_email, notification_type)
      VALUES (${moduleId}, ${userEmail.toLowerCase()}, ${type})
      ON CONFLICT (module_id, user_email, notification_type) DO NOTHING
    `;
    return;
  }
  await sql`
    INSERT INTO training_notifications (module_id, user_email, notification_type)
    VALUES (${moduleId}, ${userEmail.toLowerCase()}, ${type})
    ON CONFLICT (module_id, user_email, notification_type) DO NOTHING
  `;
}

/**
 * Reserve the one-shot notification slot before sending. The unique constraint on
 * (module_id, user_email, notification_type) makes the insert atomic, so two
 * concurrent requests cannot both mail the learner. Returns false when the slot
 * was already taken.
 */
async function claimNotification(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: "invited" | "completed",
): Promise<boolean> {
  const email = userEmail.toLowerCase();
  const isCourse = await isCourseModule(sql, moduleId);
  const rows = isCourse
    ? await sql`
        INSERT INTO course_notifications (module_id, user_email, notification_type)
        VALUES (${moduleId}, ${email}, ${type})
        ON CONFLICT (module_id, user_email, notification_type) DO NOTHING
        RETURNING 1 AS claimed
      `
    : await sql`
        INSERT INTO training_notifications (module_id, user_email, notification_type)
        VALUES (${moduleId}, ${email}, ${type})
        ON CONFLICT (module_id, user_email, notification_type) DO NOTHING
        RETURNING 1 AS claimed
      `;
  return rows.length > 0;
}

/** Give the slot back when the send failed, so a later retry can deliver. */
async function releaseNotificationClaim(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: "invited" | "completed",
): Promise<void> {
  const email = userEmail.toLowerCase();
  const isCourse = await isCourseModule(sql, moduleId);
  if (isCourse) {
    await sql`
      DELETE FROM course_notifications
      WHERE module_id = ${moduleId}
        AND LOWER(user_email) = ${email}
        AND notification_type = ${type}
    `;
    return;
  }
  await sql`
    DELETE FROM training_notifications
    WHERE module_id = ${moduleId}
      AND LOWER(user_email) = ${email}
      AND notification_type = ${type}
  `;
}

/** Append-only send log - every outbound training/course email. */
export async function recordNotificationEvent(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: NotificationEventType,
  meta?: { batchId?: string | null; triggeredBy?: string | null },
): Promise<void> {
  const email = userEmail.trim().toLowerCase();
  const batchId = meta?.batchId?.trim() || null;
  const triggeredBy = meta?.triggeredBy?.trim().toLowerCase() || null;
  const isCourse = await isCourseModule(sql, moduleId);
  if (isCourse) {
    await sql`
      INSERT INTO course_notification_events
        (module_id, user_email, notification_type, batch_id, triggered_by)
      VALUES (${moduleId}, ${email}, ${type}, ${batchId}, ${triggeredBy})
    `;
    return;
  }
  await sql`
    INSERT INTO training_notification_events
      (module_id, user_email, notification_type, batch_id, triggered_by)
    VALUES (${moduleId}, ${email}, ${type}, ${batchId}, ${triggeredBy})
  `;
}

async function wasEventSentToday(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: NotificationEventType,
): Promise<boolean> {
  const email = userEmail.trim().toLowerCase();
  const isCourse = await isCourseModule(sql, moduleId);
  const rows = isCourse
    ? await sql`
        SELECT 1
        FROM course_notification_events
        WHERE module_id = ${moduleId}
          AND LOWER(user_email) = ${email}
          AND notification_type = ${type}
          AND sent_at >= date_trunc('day', NOW())
        LIMIT 1
      `
    : await sql`
        SELECT 1
        FROM training_notification_events
        WHERE module_id = ${moduleId}
          AND LOWER(user_email) = ${email}
          AND notification_type = ${type}
          AND sent_at >= date_trunc('day', NOW())
        LIMIT 1
      `;
  return rows.length > 0;
}

export interface InvitationSendResult {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
  message: string;
}

export interface SendModuleInvitationOptions {
  /** When true, resend even if the learner was already notified for this module. */
  forceResend?: boolean;
  /** Restrict sending to one batch when the module is assigned to multiple batches. */
  batchId?: string;
  /** Email only learners who still have not started (courses and compliance). */
  reminderOnlyNotStarted?: boolean;
  /** Admin email that triggered the send (stored on event log). */
  triggeredBy?: string;
}

/** Email all learners in assigned batches when a module is ready. */
export async function sendModuleInvitationEmails(
  sql: Sql,
  moduleId: string,
  options?: SendModuleInvitationOptions,
): Promise<InvitationSendResult> {
  const forceResend = options?.forceResend === true;
  const batchId = options?.batchId?.trim() || null;
  const reminderOnlyNotStarted = options?.reminderOnlyNotStarted === true;
  const triggeredBy = options?.triggeredBy?.trim().toLowerCase() || null;
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: cfg.issues,
      message: "Mail not configured - set MAIL_FROM_ADDRESS and ensure Graph Mail.Send consent.",
    };
  }

  const modules = await sql`
    SELECT title, duration_minutes, mcq_generation_status
    FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  const moduleRows =
    modules.length > 0
      ? modules
      : await sql`
          SELECT title, duration_minutes, mcq_generation_status
          FROM training_modules WHERE id = ${moduleId} LIMIT 1
        `;
  if (moduleRows.length === 0) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, errors: ["Module not found"], message: "Module not found" };
  }
  if (moduleRows[0].mcq_generation_status !== "completed") {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["Module not ready"],
      message: "Module MCQs are not ready yet.",
    };
  }

  const moduleTitle = moduleRows[0].title as string;
  const loginBase = cfg.baseUrl;
  const isCourse = modules.length > 0;
  const kind: MailKind = isCourse ? "course" : "compliance";
  const durationLabel = isCourse
    ? courseDurationLabel(Number(moduleRows[0].duration_minutes))
    : COMPLIANCE_DURATION_LABEL;
  const subjectBrand = isCourse
    ? "Relanto AI Course"
    : "Relanto Compliance Training";

  const learners = isCourse
    ? await sql`
        SELECT DISTINCT
          u.email,
          u.display_name,
          ub.batch_id AS learner_batch_id,
          cp.status AS progress_status,
          LEAST(cp.score_percent, 100) AS score_percent,
          cp.completed_at,
          cp.last_accessed_at,
          cp.current_slide,
          cp.warning_count,
          cp.mcq_answers
        FROM users u
        INNER JOIN user_batches ub ON LOWER(ub.user_email) = LOWER(u.email)
        INNER JOIN course_module_batches mb ON mb.batch_id = ub.batch_id
        LEFT JOIN course_progress cp
          ON LOWER(cp.user_email) = LOWER(u.email)
          AND cp.module_id = ${moduleId}
          AND cp.batch_id = ub.batch_id
        WHERE mb.module_id = ${moduleId}
          AND (${batchId}::text IS NULL OR ub.batch_id = ${batchId})
          AND u.role = 'user'
          AND u.email IS NOT NULL
        ORDER BY u.email
      `
    : await sql`
        SELECT DISTINCT
          u.email,
          u.display_name,
          ub.batch_id AS learner_batch_id,
          ap.status AS progress_status,
          LEAST(ap.score_percent, 100) AS score_percent,
          ap.completed_at,
          ap.last_accessed_at,
          ap.current_slide,
          ap.warning_count,
          ap.mcq_answers
        FROM users u
        INNER JOIN user_batches ub ON LOWER(ub.user_email) = LOWER(u.email)
        INNER JOIN module_batches mb ON mb.batch_id = ub.batch_id
        LEFT JOIN assessment_progress ap
          ON LOWER(ap.user_email) = LOWER(u.email)
          AND ap.module_id = ${moduleId}
          AND ap.batch_id = ub.batch_id
        WHERE mb.module_id = ${moduleId}
          AND (${batchId}::text IS NULL OR ub.batch_id = ${batchId})
          AND u.role = 'user'
          AND u.email IS NOT NULL
        ORDER BY u.email
      `;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of learners) {
    const email = (row.email as string).trim().toLowerCase();
    const displayName =
      (row.display_name as string | null)?.trim() || firstNameFromEmail(email);

    if (reminderOnlyNotStarted) {
      const rawAnswers =
        row.mcq_answers &&
        typeof row.mcq_answers === "object" &&
        !Array.isArray(row.mcq_answers)
          ? (row.mcq_answers as Record<string, boolean>)
          : {};
      const answerCount = Object.keys(rawAnswers).length;
      const status = normalizeProgressStatus(
        (row.progress_status as string | null) ?? null,
        row.score_percent != null ? Number(row.score_percent) : null,
        (row.completed_at as string | null) ?? null,
        {
          lastAccessedAt: (row.last_accessed_at as string | null) ?? null,
          currentSlide: Number(row.current_slide ?? 0),
          answerCount,
          warningCount: Number(row.warning_count ?? 0),
        },
      );
      if (status !== "not_started") {
        skipped++;
        continue;
      }
    }

    if (
      !forceResend &&
      !reminderOnlyNotStarted &&
      (await wasNotificationSent(sql, moduleId, email, "invited"))
    ) {
      skipped++;
      continue;
    }

    // Reminders are repeatable by design (unlike the one-shot invitation), so the
    // guard is per day - otherwise a double-click re-mails the whole batch.
    if (
      !forceResend &&
      reminderOnlyNotStarted &&
      (await wasEventSentToday(sql, moduleId, email, "reminder"))
    ) {
      skipped++;
      continue;
    }

    // Claim the one-shot invite slot before sending so concurrent admin clicks
    // cannot both mail the learner. forceResend intentionally skips the claim.
    let inviteClaimed = false;
    if (!reminderOnlyNotStarted && !forceResend) {
      if (!(await claimNotification(sql, moduleId, email, "invited"))) {
        skipped++;
        continue;
      }
      inviteClaimed = true;
    }

    try {
      const loginUrl = trainingLoginUrl(moduleId, loginBase, email);
      const subjectPrefix = reminderOnlyNotStarted
        ? "Friendly reminder"
        : "Action required";
      await sendGraphMail({
        to: email,
        subject: `${subjectPrefix}: ${moduleTitle} - ${subjectBrand}`,
        htmlBody: reminderOnlyNotStarted
          ? reminderHtml({
              displayName,
              moduleTitle,
              loginUrl,
              kind,
              durationLabel,
            })
          : invitationHtml({
              displayName,
              moduleTitle,
              loginUrl,
              kind,
              durationLabel,
            }),
        textBody: reminderOnlyNotStarted
          ? reminderTextBody({
              displayName,
              moduleTitle,
              loginUrl,
              kind,
              durationLabel,
            })
          : invitationTextBody({
              displayName,
              moduleTitle,
              loginUrl,
              kind,
              durationLabel,
            }),
      });
      if (!reminderOnlyNotStarted && !inviteClaimed) {
        await recordNotification(sql, moduleId, email, "invited");
      }
      const eventBatchId =
        batchId ||
        (typeof row.learner_batch_id === "string"
          ? row.learner_batch_id.trim()
          : "") ||
        null;
      await recordNotificationEvent(
        sql,
        moduleId,
        email,
        reminderOnlyNotStarted ? "reminder" : "invited",
        { batchId: eventBatchId, triggeredBy },
      );
      sent++;
    } catch (err) {
      if (inviteClaimed) {
        await releaseNotificationClaim(sql, moduleId, email, "invited").catch(
          (releaseErr) =>
            console.error("[training-notification invite release]", releaseErr),
        );
      }
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${email}: ${msg}`);
      console.error("[training-notification invite]", email, err);
    }
  }

  return {
    ok: failed === 0,
    sent,
    skipped,
    failed,
    errors,
    message:
      sent > 0
        ? reminderOnlyNotStarted
          ? `Reminder emails sent to ${sent} learner${sent === 1 ? "" : "s"}.`
          : `Invitation emails sent to ${sent} learner${sent === 1 ? "" : "s"}.`
        : failed > 0
          ? reminderOnlyNotStarted
            ? `Failed to send ${failed} reminder email(s).`
            : `Failed to send ${failed} invitation email(s).`
          : skipped > 0
            ? reminderOnlyNotStarted
              ? "No eligible not-started learners matched this reminder."
              : "All learners were already notified."
            : batchId
              ? "No learners found in the selected batch."
              : "No learners found in assigned batches.",
  };
}

export async function sendRetakeApprovalEmail(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; message: string }> {
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    return { ok: false, message: "Mail not configured." };
  }

  const email = userEmail.trim().toLowerCase();
  const modules = await sql`
    SELECT title, duration_minutes FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  const moduleRows =
    modules.length > 0
      ? modules
      : await sql`
          SELECT title, duration_minutes FROM training_modules WHERE id = ${moduleId} LIMIT 1
        `;
  if (moduleRows.length === 0) {
    return { ok: false, message: "Module not found." };
  }

  const users = await sql`
    SELECT display_name FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
  `;
  const displayName =
    (users[0]?.display_name as string | null)?.trim() || firstNameFromEmail(email);
  const moduleTitle = moduleRows[0].title as string;
  const loginUrl = trainingLoginUrl(moduleId, cfg.baseUrl, email);
  const isCourse = modules.length > 0;
  const kind: MailKind = isCourse ? "course" : "compliance";
  const durationLabel = isCourse
    ? courseDurationLabel(Number(moduleRows[0].duration_minutes))
    : COMPLIANCE_DURATION_LABEL;
  const subjectBrand = isCourse
    ? "Relanto AI Course"
    : "Relanto Compliance Training";

  try {
    await sendGraphMail({
      to: email,
      subject: `Retake approved: ${moduleTitle} - ${subjectBrand}`,
      htmlBody: retakeHtml({
        displayName,
        moduleTitle,
        loginUrl,
        kind,
        durationLabel,
      }),
      textBody: retakeTextBody({
        displayName,
        moduleTitle,
        loginUrl,
        kind,
        durationLabel,
      }),
    });
    await recordNotificationEvent(sql, moduleId, email, "retake_approved");
    return { ok: true, message: "Retake approval email sent." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[training-notification retake]", email, err);
    return { ok: false, message };
  }
}

export async function sendModuleCompletionEmail(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; message: string; emailSent: boolean }> {
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    return { ok: false, message: "Mail not configured.", emailSent: false };
  }

  const email = userEmail.trim().toLowerCase();
  if (await wasNotificationSent(sql, moduleId, email, "completed")) {
    return { ok: true, message: "Completion email already sent.", emailSent: true };
  }

  const courseModules = await sql`
    SELECT title FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  const moduleRows =
    courseModules.length > 0
      ? courseModules
      : await sql`
          SELECT title FROM training_modules WHERE id = ${moduleId} LIMIT 1
        `;
  if (moduleRows.length === 0) {
    return { ok: false, message: "Module not found.", emailSent: false };
  }

  const users = await sql`
    SELECT display_name FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
  `;
  const displayName =
    (users[0]?.display_name as string | null)?.trim() || firstNameFromEmail(email);
  const moduleTitle = moduleRows[0].title as string;
  const kind: MailKind = courseModules.length > 0 ? "course" : "compliance";

  const progressRows =
    courseModules.length > 0
      ? await sql`
        SELECT score_percent, mcq_correct, mcq_total
        FROM course_progress
        WHERE module_id = ${moduleId}
          AND LOWER(user_email) = LOWER(${email})
        LIMIT 1
      `
      : await sql`
        SELECT score_percent, mcq_correct, mcq_total
        FROM assessment_progress
        WHERE module_id = ${moduleId}
          AND LOWER(user_email) = LOWER(${email})
        LIMIT 1
      `;
  const progress = progressRows[0];
  const resultSummary = buildCompletionResultSummary({
    moduleTitle,
    scorePercent:
      progress?.score_percent != null ? Number(progress.score_percent) : null,
    mcqCorrect:
      progress?.mcq_correct != null ? Number(progress.mcq_correct) : null,
    mcqTotal: progress?.mcq_total != null ? Number(progress.mcq_total) : null,
  });

  if (!resultSummary?.passed) {
    return {
      ok: true,
      message: "Completion email skipped (passing score required).",
      emailSent: false,
    };
  }

  const scoreRingPng = await buildScoreRingPngBuffer(
    resultSummary.scorePercent,
    true,
  );
  const inlineAttachments = [
    {
      contentId: SCORE_RING_IMAGE_CID,
      name: "score-ring.png",
      contentBytes: scoreRingPng.toString("base64"),
      contentType: "image/png",
    },
  ];
  const resultSummaryHtml = completionResultSummaryHtml(resultSummary, {
    scoreRingImageSrc: `cid:${SCORE_RING_IMAGE_CID}`,
    kind,
  });
  const resultSummaryText = completionResultTextSummary(resultSummary, { kind });
  const subjectBrand =
    kind === "course" ? "Relanto AI Course" : "Relanto Compliance Training";
  const subjectPrefix = kind === "course" ? "Completed" : "Submitted";

  // Claim before sending: the earlier check-then-send left a window where two
  // completion requests (double submit, retry) both mailed the learner.
  if (!(await claimNotification(sql, moduleId, email, "completed"))) {
    return { ok: true, message: "Completion email already sent.", emailSent: true };
  }

  try {
    await sendGraphMail({
      to: email,
      subject: `${subjectPrefix}: ${moduleTitle} - ${subjectBrand}`,
      htmlBody: completionHtml({
        displayName,
        moduleTitle,
        resultSummaryHtml,
        kind,
      }),
      textBody: completionTextBody({
        displayName,
        moduleTitle,
        resultSummaryText,
        kind,
      }),
      inlineAttachments,
    });
    await recordNotificationEvent(sql, moduleId, email, "completed");
    return { ok: true, message: "Completion email sent.", emailSent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[training-notification complete]", email, err);
    await releaseNotificationClaim(sql, moduleId, email, "completed").catch(
      (releaseErr) => console.error("[training-notification release]", releaseErr),
    );
    return { ok: false, message, emailSent: false };
  }
}

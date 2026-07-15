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

function courseDurationLabel(minutes: number | null | undefined): string {
  const mins =
    typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : COURSE_DURATION_FALLBACK_MIN;
  return `approximately ${mins} min`;
}

/** Outlook-safe solid CTA — table + white text avoids pink/inverted link colors. */
function ctaButtonHtml(loginUrl: string, label: string): string {
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0">
    <tr>
      <td bgcolor="#2e3192" style="background-color:#2e3192;border-radius:8px;mso-padding-alt:14px 28px;">
        <a href="${loginUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.25;font-weight:700;color:#ffffff !important;text-decoration:none;mso-line-height-rule:exactly;">
          <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%;mso-text-raise:21pt">&nbsp;</i><![endif]-->
          <span style="color:#ffffff !important;text-decoration:none;">${label}</span>
          <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%">&nbsp;</i><![endif]-->
        </a>
      </td>
    </tr>
  </table>`;
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
  <p style="font-size:13px;color:#52525b">${COURSE_ONE_STRETCH_NOTE}</p>
  ${ctaButtonHtml(loginUrl, "Start course")}
  <p style="font-size:13px;color:#71717a;margin-bottom:6px">Sign in with your @relanto.ai Microsoft work account to begin.</p>
  <p style="font-size:12px;color:#71717a">In case of any technical issues, please contact Relanto Academy at <a href="mailto:relanto.academy@relanto.ai" style="color:#2e3192;text-decoration:underline">relanto.academy@relanto.ai</a></p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — AI Course</p>
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
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — Compliance Agent</p>
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
      COURSE_ONE_STRETCH_NOTE,
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
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — AI Course</p>
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
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — Compliance Agent</p>
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
  <p>Your administrator approved a new attempt for <strong>${escapeHtml(moduleTitle)}</strong>. Your previous warnings were cleared — you may begin again from the start. This is a Relanto AI learning course (${durationLabel}).</p>
  <p style="font-size:13px;color:#52525b">${COURSE_ONE_STRETCH_NOTE}</p>
  ${ctaButtonHtml(loginUrl, "Start retake")}
  <p style="font-size:13px;color:#71717a">Sign in with your @relanto.ai Microsoft work account to continue.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — AI Course</p>
</body></html>`;
  }
  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Retake approved</h1>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Your administrator approved a new attempt for <strong>${escapeHtml(moduleTitle)}</strong>. Your previous warnings were cleared — you may begin again from the start. This is a proctored compliance assessment (${durationLabel}).</p>
  <p style="font-size:13px;color:#52525b">${ONE_STRETCH_NOTE}</p>
  ${ctaButtonHtml(loginUrl, "Start retake")}
  <p style="font-size:13px;color:#71717a">Sign in with your @relanto.ai Microsoft work account to continue.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — Compliance Agent</p>
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
      `Your administrator approved a new attempt for "${moduleTitle}". Your previous warnings were cleared — you may begin again from the start. This is a Relanto AI learning course (${durationLabel}).`,
      COURSE_ONE_STRETCH_NOTE,
      `Start retake here: ${loginUrl}`,
      "Sign in with your @relanto.ai Microsoft work account to continue.",
    ].join("\n\n");
  }
  return [
    `Hi ${displayName},`,
    `Your administrator approved a new attempt for "${moduleTitle}". Your previous warnings were cleared — you may begin again from the start. This is a proctored compliance assessment (${durationLabel}).`,
    ONE_STRETCH_NOTE,
    `Start retake here: ${loginUrl}`,
    "Sign in with your @relanto.ai Microsoft work account to continue.",
  ].join("\n\n");
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
}

/** Email all learners in assigned batches when a module is ready. */
export async function sendModuleInvitationEmails(
  sql: Sql,
  moduleId: string,
  options?: SendModuleInvitationOptions,
): Promise<InvitationSendResult> {
  const forceResend = options?.forceResend === true;
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: cfg.issues,
      message: "Mail not configured — set MAIL_FROM_ADDRESS and ensure Graph Mail.Send consent.",
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
        SELECT DISTINCT u.email, u.display_name
        FROM users u
        INNER JOIN course_module_batches mb ON mb.batch_id = u.batch_id
        WHERE mb.module_id = ${moduleId}
          AND u.role = 'user'
          AND u.email IS NOT NULL
        ORDER BY u.email
      `
    : await sql`
        SELECT DISTINCT u.email, u.display_name
        FROM users u
        INNER JOIN module_batches mb ON mb.batch_id = u.batch_id
        WHERE mb.module_id = ${moduleId}
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

    if (
      !forceResend &&
      (await wasNotificationSent(sql, moduleId, email, "invited"))
    ) {
      skipped++;
      continue;
    }

    try {
      const loginUrl = trainingLoginUrl(moduleId, loginBase, email);
      await sendGraphMail({
        to: email,
        subject: `Action required: ${moduleTitle} — ${subjectBrand}`,
        htmlBody: invitationHtml({
          displayName,
          moduleTitle,
          loginUrl,
          kind,
          durationLabel,
        }),
        textBody: invitationTextBody({
          displayName,
          moduleTitle,
          loginUrl,
          kind,
          durationLabel,
        }),
      });
      await recordNotification(sql, moduleId, email, "invited");
      sent++;
    } catch (err) {
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
        ? `Invitation emails sent to ${sent} learner${sent === 1 ? "" : "s"}.`
        : failed > 0
          ? `Failed to send ${failed} invitation email(s).`
          : skipped > 0
            ? "All learners were already notified."
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
      subject: `Retake approved: ${moduleTitle} — ${subjectBrand}`,
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

  try {
    await sendGraphMail({
      to: email,
      subject: `${subjectPrefix}: ${moduleTitle} — ${subjectBrand}`,
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
    await recordNotification(sql, moduleId, email, "completed");
    return { ok: true, message: "Completion email sent.", emailSent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[training-notification complete]", email, err);
    return { ok: false, message, emailSent: false };
  }
}

import type { getSql } from "@/lib/db";
import { getGraphMailConfig } from "@/lib/graph-mail-config";
import { firstNameFromEmail } from "@/lib/auth-env";
import { sendGraphMail } from "@/lib/services/graph-mail-service";

type Sql = ReturnType<typeof getSql>;

function trainingLoginUrl(moduleId: string, baseUrl: string): string {
  const callback = `/training/${encodeURIComponent(moduleId)}`;
  return `${baseUrl}/login?callbackUrl=${encodeURIComponent(callback)}`;
}

function invitationHtml(params: {
  displayName: string;
  moduleTitle: string;
  loginUrl: string;
  durationMinutes: number;
}): string {
  const { displayName, moduleTitle, loginUrl, durationMinutes } = params;
  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Mandatory training assigned</h1>
  <p>Hi ${displayName},</p>
  <p>Your administrator has sent <strong>${moduleTitle}</strong> to you. This is a proctored compliance assessment (~${durationMinutes} min).</p>
  <p style="margin:28px 0">
    <a href="${loginUrl}" style="display:inline-block;background:#2e3192;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Start training</a>
  </p>
  <p style="font-size:13px;color:#71717a">Sign in with your @relanto.ai Microsoft work account to begin.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — Compliance Agent</p>
</body></html>`;
}

function completionHtml(params: {
  displayName: string;
  moduleTitle: string;
}): string {
  const { displayName, moduleTitle } = params;
  return `
<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#18181b;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <div style="height:4px;background:linear-gradient(90deg,#2e3192,#f15a24);border-radius:2px;margin-bottom:24px"></div>
  <p style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f15a24;text-transform:uppercase">Relanto Compliance Agent</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Training submitted</h1>
  <p>Hi ${displayName},</p>
  <p>We received your completed assessment for <strong>${moduleTitle}</strong>, including your attestation and feedback.</p>
  <p style="color:#52525b">No further action is required. Thank you for completing your mandatory training.</p>
  <p style="font-size:12px;color:#a1a1aa;margin-top:32px">© Relanto — Compliance Agent</p>
</body></html>`;
}

async function wasNotificationSent(
  sql: Sql,
  moduleId: string,
  userEmail: string,
  type: "invited" | "completed",
): Promise<boolean> {
  const rows = await sql`
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

/** Email all learners in assigned batches when a module is ready. */
export async function sendModuleInvitationEmails(
  sql: Sql,
  moduleId: string,
): Promise<InvitationSendResult> {
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
    FROM training_modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (modules.length === 0) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, errors: ["Module not found"], message: "Module not found" };
  }
  if (modules[0].mcq_generation_status !== "completed") {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["Module not ready"],
      message: "Module MCQs are not ready yet.",
    };
  }

  const moduleTitle = modules[0].title as string;
  const durationMinutes = Number(modules[0].duration_minutes ?? 20);
  const loginBase = cfg.baseUrl;

  const learners = await sql`
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

    if (await wasNotificationSent(sql, moduleId, email, "invited")) {
      skipped++;
      continue;
    }

    try {
      const loginUrl = trainingLoginUrl(moduleId, loginBase);
      await sendGraphMail({
        to: email,
        subject: `Action required: ${moduleTitle} — Relanto Compliance Training`,
        htmlBody: invitationHtml({ displayName, moduleTitle, loginUrl, durationMinutes }),
        textBody: `Hi ${displayName}, complete "${moduleTitle}" here: ${loginUrl}`,
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

export async function sendModuleCompletionEmail(
  sql: Sql,
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; message: string }> {
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    return { ok: false, message: "Mail not configured." };
  }

  const email = userEmail.trim().toLowerCase();
  if (await wasNotificationSent(sql, moduleId, email, "completed")) {
    return { ok: true, message: "Completion email already sent." };
  }

  const modules = await sql`
    SELECT title FROM training_modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (modules.length === 0) {
    return { ok: false, message: "Module not found." };
  }

  const users = await sql`
    SELECT display_name FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
  `;
  const displayName =
    (users[0]?.display_name as string | null)?.trim() || firstNameFromEmail(email);
  const moduleTitle = modules[0].title as string;

  try {
    await sendGraphMail({
      to: email,
      subject: `Submitted: ${moduleTitle} — Relanto Compliance Training`,
      htmlBody: completionHtml({ displayName, moduleTitle }),
    });
    await recordNotification(sql, moduleId, email, "completed");
    return { ok: true, message: "Completion email sent." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[training-notification complete]", email, err);
    return { ok: false, message };
  }
}

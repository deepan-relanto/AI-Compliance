/** Shared shape returned from publish/reuse APIs after invitation emails. */
export interface InviteSendResult {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
  message: string;
}

export function formatInviteSummary(invites: InviteSendResult | undefined): {
  headline: string;
  detail: string;
  isSuccess: boolean;
  isWarning: boolean;
} {
  if (!invites) {
    return {
      headline: "Bundle assigned",
      detail: "Invitation email status was not returned by the server.",
      isSuccess: true,
      isWarning: true,
    };
  }

  if (invites.sent > 0) {
    return {
      headline: `Invitation emails sent to ${invites.sent} learner${invites.sent === 1 ? "" : "s"}`,
      detail: [
        invites.message,
        invites.skipped > 0 ? `${invites.skipped} already notified.` : "",
        invites.failed > 0 ? `${invites.failed} failed.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      isSuccess: true,
      isWarning: invites.failed > 0,
    };
  }

  if (invites.failed > 0) {
    return {
      headline: "Bundle assigned, but emails failed",
      detail: [invites.message, ...invites.errors.slice(0, 3)].filter(Boolean).join(" "),
      isSuccess: false,
      isWarning: true,
    };
  }

  if (invites.message.toLowerCase().includes("not configured")) {
    return {
      headline: "Bundle assigned — mail not configured",
      detail:
        "Set MAIL_FROM_ADDRESS on the server and grant Azure Application Mail.Send. Check /api/mail/status on your deployment.",
      isSuccess: true,
      isWarning: true,
    };
  }

  if (invites.message.toLowerCase().includes("no learners")) {
    return {
      headline: "Bundle assigned — no learners in selected batches",
      detail:
        "Users need role=user and a batch_id matching the batch you selected. Assign batches in Admin → Batches if needed.",
      isSuccess: true,
      isWarning: true,
    };
  }

  if (invites.skipped > 0) {
    return {
      headline: "Bundle assigned — all learners already notified",
      detail: invites.message,
      isSuccess: true,
      isWarning: true,
    };
  }

  return {
    headline: "Bundle assigned",
    detail: invites.message || "No invitation emails were sent.",
    isSuccess: true,
    isWarning: true,
  };
}

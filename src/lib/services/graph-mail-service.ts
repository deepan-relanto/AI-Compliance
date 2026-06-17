import { getGraphMailConfig } from "@/lib/graph-mail-config";

interface GraphTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export interface SendMailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function resetGraphMailTokenCache(): void {
  cachedToken = null;
}

export async function getGraphAccessToken(): Promise<string> {
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured || !cfg.clientSecret) {
    throw new Error(`Graph mail not configured: ${cfg.issues.join(", ")}`);
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId!,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = (await res.json()) as GraphTokenResponse & { expires_in?: number };
  if (!res.ok || !data.access_token) {
    const detail = data.error_description ?? data.error ?? res.statusText;
    throw new Error(`Graph token request failed: ${detail}`);
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

export async function sendGraphMail(params: SendMailParams): Promise<void> {
  const cfg = getGraphMailConfig();
  if (!cfg.isConfigured) {
    throw new Error(`Graph mail not configured: ${cfg.issues.join(", ")}`);
  }

  const token = await getGraphAccessToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.mailFrom)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: {
            contentType: "HTML",
            content: params.htmlBody,
          },
          toRecipients: [{ emailAddress: { address: params.to } }],
        },
        saveToSentItems: true,
      }),
    },
  );

  // Graph returns 204 (No Content) or 202 (Accepted) on success.
  if (res.status === 204 || res.status === 202) return;

  let detail = res.statusText;
  try {
    const err = (await res.json()) as { error?: { message?: string; code?: string } };
    detail = err.error?.message ?? detail;
    if (err.error?.code === "ErrorAccessDenied") {
      throw new Error(
        "Graph Mail.Send access denied. Ensure Application Mail.Send has admin consent and the app can send as MAIL_FROM_ADDRESS.",
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("Mail.Send")) throw e;
  }
  throw new Error(`Graph sendMail failed (${res.status}): ${detail}`);
}

/** Verify client-credentials token can be obtained (does not send mail). */
export async function verifyGraphMailPermission(): Promise<{ ok: boolean; message: string }> {
  try {
    await getGraphAccessToken();
    return { ok: true, message: "Graph application token acquired successfully." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Graph permission check failed.",
    };
  }
}

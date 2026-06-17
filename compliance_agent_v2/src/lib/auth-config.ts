import { env } from "@/lib/auth-env";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Azure "Secret ID" is a GUID — not the Value shown only once at creation. */
export function looksLikeAzureSecretId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function getMicrosoftAuthConfig() {
  const clientId =
    env("AUTH_AZURE_AD_CLIENT_ID") ?? env("AUTH_MICROSOFT_ENTRA_ID_ID");
  let clientSecret =
    env("AUTH_AZURE_AD_CLIENT_SECRET") ?? env("AUTH_MICROSOFT_ENTRA_ID_SECRET");
  const tenantRaw =
    env("AUTH_AZURE_AD_TENANT_ID") ?? env("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  const tenantId = tenantRaw?.includes("microsoftonline.com")
    ? tenantRaw.match(/microsoftonline\.com\/([^/]+)/)?.[1]
    : tenantRaw;
  const secret = env("AUTH_SECRET") ?? env("NEXTAUTH_SECRET");
  const baseUrl =
    env("AUTH_URL") ?? env("NEXTAUTH_URL") ?? "http://localhost:3000";

  const issues: string[] = [];
  if (!clientId) issues.push("AUTH_AZURE_AD_CLIENT_ID");
  if (!tenantId) issues.push("AUTH_AZURE_AD_TENANT_ID");
  if (!secret) issues.push("AUTH_SECRET");
  if (!clientSecret) {
    issues.push("AUTH_AZURE_AD_CLIENT_SECRET");
  } else if (
    looksLikeAzureSecretId(clientSecret) ||
    clientSecret.includes("REPLACE_WITH")
  ) {
    issues.push("AUTH_AZURE_AD_CLIENT_SECRET_IS_SECRET_ID_NOT_VALUE");
    clientSecret = undefined;
  }

  return {
    clientId,
    clientSecret,
    tenantId,
    secret,
    baseUrl: baseUrl.replace(/\/$/, ""),
    callbackUrl: `${baseUrl.replace(/\/$/, "")}/api/auth/callback/microsoft-entra-id`,
    isConfigured: issues.length === 0,
    issues,
  };
}

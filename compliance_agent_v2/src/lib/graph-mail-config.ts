import { getMicrosoftAuthConfig, looksLikeAzureSecretId } from "@/lib/auth-config";
import { env } from "@/lib/auth-env";

export function getGraphMailConfig() {
  const auth = getMicrosoftAuthConfig();
  const tenantId = env("GRAPH_TENANT_ID") ?? auth.tenantId;
  const clientId = env("GRAPH_CLIENT_ID") ?? auth.clientId;
  let clientSecret = env("GRAPH_CLIENT_SECRET") ?? auth.clientSecret;
  const mailFrom = env("MAIL_FROM_ADDRESS")?.trim() ?? "";
  const baseUrl = auth.baseUrl;

  const issues: string[] = [];
  if (!tenantId) issues.push("GRAPH_TENANT_ID or AUTH_AZURE_AD_TENANT_ID");
  if (!clientId) issues.push("GRAPH_CLIENT_ID or AUTH_AZURE_AD_CLIENT_ID");
  if (!clientSecret) {
    issues.push("GRAPH_CLIENT_SECRET or AUTH_AZURE_AD_CLIENT_SECRET");
  } else if (looksLikeAzureSecretId(clientSecret)) {
    issues.push("GRAPH_CLIENT_SECRET_IS_SECRET_ID_NOT_VALUE");
    clientSecret = undefined;
  }
  if (!mailFrom) issues.push("MAIL_FROM_ADDRESS");

  return {
    tenantId,
    clientId,
    clientSecret,
    mailFrom,
    baseUrl,
    isConfigured: issues.length === 0,
    issues,
  };
}

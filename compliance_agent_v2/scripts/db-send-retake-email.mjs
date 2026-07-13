/** Send retake approval email. Usage: node scripts/db-send-retake-email.mjs <email> [moduleId] */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function env(key) {
  return process.env[key]?.trim() || "";
}

loadEnv();
const sql = neon(process.env.DATABASE_URL);
const userEmail = process.argv[2];
const moduleId = process.argv[3] || "security-awareness-may2026-mqhk9xmk";

if (!userEmail) {
  console.error("Usage: node scripts/db-send-retake-email.mjs <email> [moduleId]");
  process.exit(1);
}

const tenantId = env("GRAPH_TENANT_ID") || env("AUTH_AZURE_AD_TENANT_ID");
const clientId = env("GRAPH_CLIENT_ID") || env("AUTH_AZURE_AD_CLIENT_ID");
const clientSecret = env("GRAPH_CLIENT_SECRET") || env("AUTH_AZURE_AD_CLIENT_SECRET");
const mailFrom = env("MAIL_FROM_ADDRESS");
const baseUrl = (env("AUTH_URL") || env("NEXTAUTH_URL") || "http://localhost:3000").replace(/\/$/, "");

const mod = await sql`SELECT title FROM training_modules WHERE id = ${moduleId} LIMIT 1`;
const user = await sql`SELECT display_name FROM users WHERE LOWER(email) = LOWER(${userEmail}) LIMIT 1`;
const moduleTitle = mod[0]?.title || moduleId;
const displayName = user[0]?.display_name || userEmail.split("@")[0];
const loginUrl = `${baseUrl}/login?callbackUrl=${encodeURIComponent(`/training/${moduleId}`)}`;

const tokenRes = await fetch(
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  },
);
const tokenData = await tokenRes.json();
if (!tokenData.access_token) throw new Error("Graph token failed");

const html = `<p>Hi ${displayName},</p><p>Your retake for <strong>${moduleTitle}</strong> was approved.</p><p><a href="${loginUrl}">Start retake</a></p>`;
const sendRes = await fetch(
  `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailFrom)}/sendMail`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: `Retake approved: ${moduleTitle} — Relanto Compliance Training`,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: userEmail.toLowerCase() } }],
      },
      saveToSentItems: true,
    }),
  },
);

if (sendRes.status === 204 || sendRes.status === 202) {
  console.log(`✓ Retake email sent to ${userEmail}`);
} else {
  console.error("Send failed:", sendRes.status, await sendRes.text());
  process.exit(1);
}

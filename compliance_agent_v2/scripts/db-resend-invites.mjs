/**
 * Resend module invitation emails via Microsoft Graph.
 * Usage: node scripts/db-resend-invites.mjs [moduleId]
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

function env(key) {
  return process.env[key]?.trim() || "";
}

function getMailConfig() {
  const tenantId = env("GRAPH_TENANT_ID") || env("AUTH_AZURE_AD_TENANT_ID");
  const clientId = env("GRAPH_CLIENT_ID") || env("AUTH_AZURE_AD_CLIENT_ID");
  const clientSecret = env("GRAPH_CLIENT_SECRET") || env("AUTH_AZURE_AD_CLIENT_SECRET");
  const mailFrom = env("MAIL_FROM_ADDRESS");
  const baseUrl = (env("AUTH_URL") || env("NEXTAUTH_URL") || "http://localhost:3000").replace(/\/$/, "");
  const issues = [];
  if (!tenantId) issues.push("AUTH_AZURE_AD_TENANT_ID");
  if (!clientId) issues.push("AUTH_AZURE_AD_CLIENT_ID");
  if (!clientSecret) issues.push("AUTH_AZURE_AD_CLIENT_SECRET");
  if (!mailFrom) issues.push("MAIL_FROM_ADDRESS");
  return { tenantId, clientId, clientSecret, mailFrom, baseUrl, issues, ok: issues.length === 0 };
}

async function getToken(cfg) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token failed");
  }
  return data.access_token;
}

async function sendMail(cfg, token, to, subject, html) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.mailFrom)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    },
  );
  if (res.status === 204 || res.status === 202) return;
  const err = await res.json().catch(() => ({}));
  throw new Error(err?.error?.message || res.statusText);
}

loadEnv();
const moduleId = process.argv[2] || "security-awareness-may2026-mqhk9xmk";
const cfg = getMailConfig();
if (!cfg.ok) {
  console.error("❌ Mail not configured:", cfg.issues.join(", "));
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const mod = await sql`SELECT title, duration_minutes, mcq_generation_status FROM training_modules WHERE id = ${moduleId} LIMIT 1`;
if (!mod.length) {
  console.error("❌ Module not found:", moduleId);
  process.exit(1);
}
if (mod[0].mcq_generation_status !== "completed") {
  console.error("❌ Module MCQs not ready:", mod[0].mcq_generation_status);
  process.exit(1);
}

const learners = await sql`
  SELECT DISTINCT u.email, u.display_name
  FROM users u
  INNER JOIN module_batches mb ON mb.batch_id = u.batch_id
  WHERE mb.module_id = ${moduleId} AND u.role = 'user'
  ORDER BY u.email
`;

console.log(`Sending invites for "${mod[0].title}" to ${learners.length} learner(s)…\n`);
const token = await getToken(cfg);
let sent = 0;
let failed = 0;

for (const row of learners) {
  const email = row.email.toLowerCase();
  const name = row.display_name || email.split("@")[0];
  const loginUrl = `${cfg.baseUrl}/login?callbackUrl=${encodeURIComponent(`/training/${moduleId}`)}`;
  const html = `<p>Hi ${name},</p><p>Complete <strong>${mod[0].title}</strong>: <a href="${loginUrl}">Start training</a></p>`;
  try {
    await sendMail(cfg, token, email, `Action required: ${mod[0].title} — Relanto Compliance Training`, html);
    await sql`
      INSERT INTO training_notifications (module_id, user_email, notification_type)
      VALUES (${moduleId}, ${email}, 'invited')
      ON CONFLICT (module_id, user_email, notification_type) DO NOTHING
    `;
    console.log(`  ✓ ${email}`);
    sent++;
  } catch (e) {
    console.error(`  ✗ ${email}: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone: ${sent} sent, ${failed} failed.`);

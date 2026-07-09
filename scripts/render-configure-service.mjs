#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SERVICE_ID = "srv-d972b3naqgkc73cpj610";
const PROD_URL = "https://compliance-agent-j3na.onrender.com";

function readRenderKey() {
  const cfg = fs.readFileSync(path.join(os.homedir(), ".render", "cli.yaml"), "utf8");
  const m = cfg.match(/^    key: (rnd_\S+)/m);
  if (!m) throw new Error("No Render API key");
  return m[1];
}

function parseEnvFile(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

async function api(method, urlPath, body) {
  const res = await fetch(`https://api.render.com/v1${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${readRenderKey()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${method} ${urlPath} → ${res.status}: ${text}`);
    throw new Error("API failed");
  }
  return text ? JSON.parse(text) : null;
}

const env = parseEnvFile(path.join(process.cwd(), ".env"));

const envVars = [
  { key: "NODE_VERSION", value: "22" },
  { key: "NODE_ENV", value: "production" },
  { key: "DATABASE_URL", value: env.DATABASE_URL },
  { key: "AUTH_AZURE_AD_CLIENT_ID", value: env.AUTH_AZURE_AD_CLIENT_ID },
  { key: "AUTH_AZURE_AD_TENANT_ID", value: env.AUTH_AZURE_AD_TENANT_ID },
  { key: "AUTH_AZURE_AD_CLIENT_SECRET", value: env.AUTH_AZURE_AD_CLIENT_SECRET },
  { key: "AUTH_SECRET", value: env.AUTH_SECRET },
  { key: "AUTH_URL", value: PROD_URL },
  { key: "NEXTAUTH_URL", value: PROD_URL },
  { key: "NVIDIA_API_KEY", value: env.NVIDIA_API_KEY },
  { key: "NVIDIA_MODEL", value: env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct" },
  { key: "MAIL_FROM_ADDRESS", value: env.MAIL_FROM_ADDRESS },
].filter((e) => e.value);

await api("PUT", `/services/${SERVICE_ID}/env-vars`, envVars);
console.log("Env vars set.");
console.log("  AUTH_URL =", PROD_URL);
console.log("  NEXTAUTH_URL =", PROD_URL);

await api("PATCH", `/services/${SERVICE_ID}`, {
  serviceDetails: {
    healthCheckPath: "/api/auth/status",
  },
});
console.log("Health check path set.");

const service = await api("GET", `/services/${SERVICE_ID}`);
if (service?.suspended === "suspended") {
  console.log("Resuming suspended service…");
  await api("POST", `/services/${SERVICE_ID}/resume`, {});
}

const deploy = await api("POST", `/services/${SERVICE_ID}/deploys`, {
  clearCache: "clear",
});
console.log("Deploy triggered:", deploy?.id ?? deploy);

console.log("\nProduction URL:", PROD_URL);
console.log("Azure redirect URI:", `${PROD_URL}/api/auth/callback/microsoft-entra-id`);

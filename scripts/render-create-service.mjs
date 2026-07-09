#!/usr/bin/env node
/**
 * One-time Render service creation via API (uses ~/.render/cli.yaml key).
 * Usage: node scripts/render-create-service.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OWNER_ID = "tea-d84vg2mk1jcs73an97bg";
const PROD_URL = "https://compliance-agent-fe1t.onrender.com";

function readRenderKey() {
  const cfg = fs.readFileSync(path.join(os.homedir(), ".render", "cli.yaml"), "utf8");
  const m = cfg.match(/^    key: (rnd_\S+)/m);
  if (!m) throw new Error("No Render API key in ~/.render/cli.yaml — run render login");
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
  const key = readRenderKey();
  const res = await fetch(`https://api.render.com/v1${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${urlPath} → ${res.status}`);
  }
  return json;
}

const env = parseEnvFile(path.join(process.cwd(), ".env"));

const payload = {
  type: "web_service",
  name: "compliance-agent",
  ownerId: OWNER_ID,
  repo: "https://github.com/deepan-relanto/AI-Compliance",
  branch: "main",
  rootDir: "compliance_agent_v2",
  autoDeploy: "yes",
  envVars: [
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
  ].filter((e) => e.value),
  serviceDetails: {
    runtime: "node",
    region: "oregon",
    plan: "free",
    healthCheckPath: "/api/auth/status",
    envSpecificDetails: {
      buildCommand: "npm install && npm run build",
      startCommand: "npm start",
    },
  },
};

const result = await api("POST", "/services", payload);
const service = result.service ?? result;
console.log(JSON.stringify({
  id: service.id,
  name: service.name,
  url: service.serviceDetails?.url ?? service.dashboardUrl,
  slug: service.slug,
}, null, 2));

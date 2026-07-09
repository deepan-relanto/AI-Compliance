#!/usr/bin/env node
/**
 * Deploy compliance_agent_v2 from AI-compliance branch to the fe1t Render service.
 * Does NOT touch compliance_agent_v2 main.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SERVICE_ID = "srv-d8j4pum47okc739t3c30";
const REPO = "https://github.com/deepan-relanto/compliance_agent_v2";
const BRANCH = "AI-compliance";

function readRenderKey() {
  const cfg = fs.readFileSync(path.join(os.homedir(), ".render", "cli.yaml"), "utf8");
  const m = cfg.match(/^    key: (rnd_\S+)/m);
  if (!m) throw new Error("No Render API key — run: render login");
  return m[1];
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
    return null;
  }
  return text ? JSON.parse(text) : null;
}

console.log("Pointing service at compliance_agent_v2 / AI-compliance…");
await api("PATCH", `/services/${SERVICE_ID}`, {
  repo: REPO,
  branch: BRANCH,
  rootDir: "",
  autoDeploy: "yes",
});

console.log("Triggering deploy from latest AI-compliance commit…");
const deploy = await api("POST", `/services/${SERVICE_ID}/deploys`, {
  clearCache: "clear",
});

if (deploy?.id) {
  console.log("Deploy started:", deploy.id, deploy.status);
} else {
  process.exit(1);
}

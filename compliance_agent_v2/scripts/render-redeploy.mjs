#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SERVICE_ID = "srv-d972b3naqgkc73cpj610";
const REPO = "https://github.com/deepan-relanto/AI-Compliance";

function readRenderKey() {
  const cfg = fs.readFileSync(path.join(os.homedir(), ".render", "cli.yaml"), "utf8");
  const m = cfg.match(/^    key: (rnd_\S+)/m);
  if (!m) throw new Error("No Render API key");
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

console.log("Refreshing repo connection…");
await api("PATCH", `/services/${SERVICE_ID}`, {
  repo: REPO,
  branch: "main",
  rootDir: "compliance_agent_v2",
  autoDeploy: "yes",
});

console.log("Triggering deploy…");
const deploy = await api("POST", `/services/${SERVICE_ID}/deploys`, {});
if (deploy?.id) {
  console.log("Deploy started:", deploy.id, deploy.status);
} else {
  process.exit(1);
}

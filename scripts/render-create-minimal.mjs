#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  console.log(`${method} ${urlPath} → ${res.status}`);
  console.log(text.slice(0, 2000));
  return { status: res.status, text };
}

// Minimal create first
await api("POST", "/services", {
  type: "web_service",
  name: "compliance-agent",
  ownerId: "tea-d8j4nse7r5hc73dge4mg",
  repo: "https://github.com/deepan-relanto/compliance_agent_v2",
  branch: "main",
  autoDeploy: "yes",
  serviceDetails: {
    runtime: "node",
    region: "oregon",
    plan: "starter",
    healthCheckPath: "/api/auth/status",
    envSpecificDetails: {
      buildCommand: "npm install && npm run build",
      startCommand: "npm start",
    },
  },
});

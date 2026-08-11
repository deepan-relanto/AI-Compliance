/**
 * Production entry for Render — bind 0.0.0.0 so the proxy can reach the app.
 * Runs the Next.js standalone server from its own directory.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const server = path.join(standaloneDir, "server.js");

if (!fs.existsSync(server)) {
  console.error("[start-production] Missing", server);
  process.exit(1);
}

const env = {
  ...process.env,
  HOSTNAME: "0.0.0.0",
  PORT: process.env.PORT || "10000",
};

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env,
  cwd: standaloneDir,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

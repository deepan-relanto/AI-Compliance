/**
 * Minimal seed entrypoint — delegates to Relanto teams/users.
 * Legacy batch_a/b/c demo data is no longer seeded here.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const r = spawnSync(process.execPath, [join(__dirname, "db-seed-relanto-users.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

process.exit(r.status ?? 1);

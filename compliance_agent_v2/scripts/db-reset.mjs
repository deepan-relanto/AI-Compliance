/**
 * Fresh test environment: clear all training content + re-seed users/batches.
 * Usage: npm run db:reset
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(script) {
  const r = spawnSync(process.execPath, [join(__dirname, script)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("🔄 Resetting database for fresh testing…\n");
run("db-migrate.mjs");
run("db-migrate-alter.mjs");
run("db-clear-modules.mjs");
run("db-seed.mjs");
console.log("\n✅ Database reset complete. Users and batches are seeded; no training modules.");

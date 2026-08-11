/**
 * Copy static assets into the Next.js standalone output so `node .next/standalone/server.js`
 * can serve /_next/static and /public on Render.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standalone, "public");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

if (!fs.existsSync(standalone)) {
  console.warn("[prepare-standalone] .next/standalone missing — skip");
  process.exit(0);
}

copyDir(staticSrc, staticDest);
copyDir(publicSrc, publicDest);
console.log("[prepare-standalone] Copied .next/static and public into standalone");

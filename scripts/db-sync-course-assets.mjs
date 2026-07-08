/**
 * Upload local public/course-assets files into Neon course_assets
 * so Render can serve them after redeploy.
 *
 * Usage: node scripts/db-sync-course-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "public", "course-assets");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(url);
if (!fs.existsSync(dir)) {
  console.log("No public/course-assets directory.");
  process.exit(0);
}

const MIME = {
  ".html": "text/html",
  ".htm": "text/html",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".json": "application/json",
};

const files = fs
  .readdirSync(dir)
  .filter((f) => !f.endsWith(".meta.json") && fs.statSync(path.join(dir, f)).isFile());

let ok = 0;
for (const filename of files) {
  const filePath = path.join(dir, filename);
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  let mime = MIME[ext] ?? "application/octet-stream";
  const metaPath = path.join(dir, `${filename}.meta.json`);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.mimeType) mime = meta.mimeType;
    } catch {
      /* ignore */
    }
  }
  const assetUrl = `/course-assets/${filename}`;
  await sql`
    INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
    VALUES (${filename}, ${assetUrl}, ${mime}, ${buffer.length}, ${buffer})
    ON CONFLICT (filename) DO UPDATE SET
      asset_url = EXCLUDED.asset_url,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      data = EXCLUDED.data
  `;
  ok++;
  console.log(`  synced ${filename} (${Math.round(buffer.length / 1024)} KB)`);
}

console.log(`Synced ${ok} course asset(s) to Neon.`);

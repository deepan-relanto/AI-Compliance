/**
 * Sync ALL files in public/course-assets into Neon course_assets
 * so learners can load them via /api/files/course-assets/... on Render.
 *
 * Usage: node scripts/db-sync-course-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "public", "course-assets");
const HTTP_SAFE = 40 * 1024 * 1024;

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
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(url);
const pool = new Pool({ connectionString: url });

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

console.log(`Found ${files.length} local asset file(s). Syncing to Neon…`);

let synced = 0;
let skipped = 0;

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

  const existing = await sql`
    SELECT size_bytes FROM course_assets WHERE filename = ${filename} LIMIT 1
  `;
  if (existing.length && Number(existing[0].size_bytes) === buffer.length) {
    console.log(`  skip ${filename}`);
    skipped++;
    continue;
  }

  console.log(`  upload ${filename} (${Math.round(buffer.length / 1024)} KB)…`);

  if (buffer.length <= HTTP_SAFE) {
    await sql`
      INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
      VALUES (${filename}, ${assetUrl}, ${mime}, ${buffer.length}, ${buffer})
      ON CONFLICT (filename) DO UPDATE SET
        asset_url = EXCLUDED.asset_url,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        data = EXCLUDED.data
    `;
  } else {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (filename) DO UPDATE SET
           asset_url = EXCLUDED.asset_url,
           mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes,
           data = EXCLUDED.data`,
        [filename, assetUrl, mime, buffer.length, buffer],
      );
    } finally {
      client.release();
    }
  }
  console.log(`  ok ${filename}`);
  synced++;
}

await pool.end();

const summary = await sql`
  SELECT COUNT(*)::int AS c, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
  FROM course_assets
`;
console.log(
  `Done. synced=${synced} skipped=${skipped} dbRows=${summary[0].c} totalBytes=${summary[0].bytes}`,
);

/**
 * Sync remaining small assets (skip if already present); for large videos use ws Pool.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "public", "course-assets");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = v;
  }
}

loadEnv();
neonConfig.webSocketConstructor = ws;

const MODULE_ID = process.argv[2] || "course-ai-basics-1783575957097";
const HTTP_SAFE = 40 * 1024 * 1024; // stay under Neon HTTP 64MB request limit after encoding

const sql = neon(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIME = {
  ".html": "text/html",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const steps = await sql`
  SELECT config->>'assetUrl' AS asset_url
  FROM course_module_steps
  WHERE module_id = ${MODULE_ID}
    AND config->>'assetUrl' IS NOT NULL
`;

console.log(`Syncing ${steps.length} assets for ${MODULE_ID}…`);

for (const row of steps) {
  const assetUrl = String(row.asset_url);
  const filename = assetUrl.split("/").pop();
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`  MISSING: ${filename}`);
    continue;
  }
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

  const existing = await sql`
    SELECT size_bytes FROM course_assets WHERE filename = ${filename} LIMIT 1
  `;
  if (existing.length && Number(existing[0].size_bytes) === buffer.length) {
    console.log(`  skip (already synced) ${filename}`);
    continue;
  }

  console.log(`  uploading ${filename} (${Math.round(buffer.length / 1024)} KB)…`);

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
}

await pool.end();
const count = await sql`SELECT COUNT(*)::int AS c, COALESCE(SUM(size_bytes),0)::bigint AS bytes FROM course_assets`;
console.log(`Done. rows=${count[0].c} totalBytes=${count[0].bytes}`);

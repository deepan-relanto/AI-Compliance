/**
 * Replace the HTML lesson asset for a course module step and persist to Neon.
 * Usage: node scripts/db-replace-course-html.mjs <path-to-html> [moduleId]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ASSETS_DIR = path.join(root, "public", "course-assets");
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

const htmlPath = process.argv[2];
const moduleIdArg = process.argv[3];

if (!htmlPath || !fs.existsSync(htmlPath)) {
  console.error("Usage: node scripts/db-replace-course-html.mjs <path-to-html> [moduleId]");
  process.exit(1);
}

let buffer = fs.readFileSync(htmlPath);
const originalName = path.basename(htmlPath);
const mimeType = "text/html";

if (buffer.length > 100 * 1024 * 1024) {
  console.error("File exceeds 100 MB limit.");
  process.exit(1);
}

const sql = neon(url);
const pool = new Pool({ connectionString: url });

let moduleId = moduleIdArg;
if (!moduleId) {
  const rows = await sql`
    SELECT DISTINCT s.module_id
    FROM course_module_steps s
    WHERE s.step_type = 'pdf'
    ORDER BY s.module_id
    LIMIT 5
  `;
  if (rows.length === 0) {
    console.error("No course pdf/html steps found.");
    process.exit(1);
  }
  moduleId = rows[0].module_id;
  if (rows.length > 1) {
    console.log("Multiple course modules with pdf step:", rows.map((r) => r.module_id));
  }
}

const stepRows = await sql`
  SELECT id, config FROM course_module_steps
  WHERE module_id = ${moduleId} AND step_type = 'pdf'
  LIMIT 1
`;
if (stepRows.length === 0) {
  console.error(`No pdf/html step for module ${moduleId}`);
  process.exit(1);
}

const step = stepRows[0];
const config =
  typeof step.config === "string" ? JSON.parse(step.config) : (step.config ?? {});

let assetUrl = config.assetUrl;
let filename;

if (assetUrl && assetUrl.startsWith("/course-assets/")) {
  filename = assetUrl.replace("/course-assets/", "");
} else {
  filename = `${crypto.randomUUID()}.html`;
  assetUrl = `/course-assets/${filename}`;
}

if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
const filePath = path.join(ASSETS_DIR, filename);
fs.writeFileSync(filePath, buffer);
fs.writeFileSync(
  path.join(ASSETS_DIR, `${filename}.meta.json`),
  JSON.stringify({ mimeType, originalName, sizeBytes: buffer.length }),
);

async function persistBlob() {
  if (buffer.length <= HTTP_SAFE) {
    await sql`
      INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
      VALUES (${filename}, ${assetUrl}, ${mimeType}, ${buffer.length}, ${buffer})
      ON CONFLICT (filename) DO UPDATE SET
        asset_url = EXCLUDED.asset_url,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        data = EXCLUDED.data
    `;
    return;
  }
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
      [filename, assetUrl, mimeType, buffer.length, buffer],
    );
  } finally {
    client.release();
  }
}

await persistBlob();

const newConfig = {
  ...config,
  assetUrl,
  originalName,
  mimeType,
};

await sql`
  UPDATE course_module_steps
  SET config = ${JSON.stringify(newConfig)}::jsonb, updated_at = NOW()
  WHERE id = ${step.id}
`;

console.log(`✅ HTML lesson updated for module ${moduleId}`);
console.log(`   assetUrl: ${assetUrl}`);
console.log(`   size: ${(buffer.length / 1024).toFixed(1)} KB`);
console.log(`   Neon course_assets row upserted.`);

await pool.end();

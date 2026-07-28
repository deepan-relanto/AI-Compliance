/**
 * Patch Module 3 lesson HTML + keep other assets; refresh Neon course steps.
 * Usage: node scripts/db-patch-module3-assets.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ASSETS_DIR = path.join(root, "public", "course-assets");
const HTTP_SAFE = 40 * 1024 * 1024;
const MODULE_ID = "course-ai-security-privacy-compliance-1785143485222";

const LESSON_SRC = path.join(
  root,
  "content-kit",
  "interactive-html",
  "relanto_ai_security_privacy_compliance_interactive.html",
);
const INFOGRAPHIC_SRC = path.join(
  root,
  "content-kit",
  "infographic",
  "AI_Security_Privacy_Compliance.png",
);

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

function writeDiskAsset(filename, buffer, mimeType, originalName) {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ASSETS_DIR, filename), buffer);
  fs.writeFileSync(
    path.join(ASSETS_DIR, `${filename}.meta.json`),
    JSON.stringify({ mimeType, originalName, sizeBytes: buffer.length }),
  );
}

loadEnv();
neonConfig.webSocketConstructor = ws;
const url = process.env.DATABASE_URL || process.env.postgres_neon;
const sql = neon(url);
const pool = new Pool({ connectionString: url });

async function upsertAsset(filename, assetUrl, buffer, mimeType) {
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

async function storeAndPoint(stepType, srcPath, originalName, mimeType, ext, extra = {}) {
  const buffer = fs.readFileSync(srcPath);
  const filename = `${crypto.randomUUID()}${ext}`;
  const assetUrl = `/course-assets/${filename}`;
  writeDiskAsset(filename, buffer, mimeType, originalName);
  await upsertAsset(filename, assetUrl, buffer, mimeType);
  const config = JSON.stringify({
    assetUrl,
    originalName,
    mimeType,
    ...extra,
  });
  await sql`
    UPDATE course_module_steps
    SET config = ${config}::jsonb, updated_at = NOW()
    WHERE module_id = ${MODULE_ID} AND step_type = ${stepType}
  `;
  console.log(`✅ ${stepType} → ${assetUrl}`);
}

try {
  const lessonHtml = fs.readFileSync(LESSON_SRC, "utf8");
  if (/Minimize one task|tag">Practice</i.test(lessonHtml)) {
    throw new Error("Practice card still present in lesson HTML");
  }
  const slides = (lessonHtml.match(/<section\s+class="slide/gi) || []).length || 20;

  await storeAndPoint(
    "pdf",
    LESSON_SRC,
    "relanto_ai_security_privacy_compliance_interactive.html",
    "text/html",
    ".html",
    { pageCount: slides },
  );
  await storeAndPoint(
    "infographic",
    INFOGRAPHIC_SRC,
    "AI_Security_Privacy_Compliance.png",
    "image/png",
    ".png",
  );

  await sql`
    UPDATE course_modules
    SET mcq_generation_status = 'completed', updated_at = NOW()
    WHERE id = ${MODULE_ID}
  `;
  console.log(`\nModule ${MODULE_ID} patched.`);
} catch (err) {
  console.error(err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

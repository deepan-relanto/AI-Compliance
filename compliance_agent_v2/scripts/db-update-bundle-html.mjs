/**
 * Push updated lesson + mindmap HTML into Neon course_assets for the AI basics bundle.
 * Updates lesson pageCount to match slide count.
 *
 * Usage: node scripts/db-update-bundle-html.mjs [moduleId]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

const MODULE_ID = process.argv[2] || "course-ai-basics-1783575957097";
const sql = neon(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const LESSON_PATH = path.join(
  root,
  "content-kit",
  "interactive-html",
  "relanto_ai_fundamentals_interactive.html",
);
const MINDMAP_PATH = path.join(root, "content-kit", "mindmap-html", "mindmap-01.html");

function slideCountFromLesson(html) {
  const matches = html.match(/<section\s+class="slide/gi);
  return matches?.length ?? 1;
}

async function upsertAsset(filename, assetUrl, buffer, mimeType) {
  if (buffer.length <= 40 * 1024 * 1024) {
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

const steps = await sql`
  SELECT step_order, step_type, config
  FROM module_steps
  WHERE module_id = ${MODULE_ID}
  ORDER BY step_order
`;

const lessonStep = steps.find((s) => s.step_type === "pdf");
const mindmapStep = steps.find((s) => s.step_type === "mindmap");

if (!lessonStep?.config?.assetUrl || !mindmapStep?.config?.assetUrl) {
  console.error("Bundle is missing lesson or mindmap step.");
  process.exit(1);
}

const lessonFilename = String(lessonStep.config.assetUrl).split("/").pop();
const mindmapFilename = String(mindmapStep.config.assetUrl).split("/").pop();
const lessonHtml = fs.readFileSync(LESSON_PATH, "utf8");
const mindmapHtml = fs.readFileSync(MINDMAP_PATH, "utf8");
const lessonBuffer = Buffer.from(lessonHtml, "utf8");
const mindmapBuffer = Buffer.from(mindmapHtml, "utf8");
const slideCount = slideCountFromLesson(lessonHtml);

console.log(`Updating bundle ${MODULE_ID}`);
console.log(`  lesson  → ${lessonFilename} (${slideCount} slides, ${lessonBuffer.length} bytes)`);
console.log(`  mindmap → ${mindmapFilename} (${mindmapBuffer.length} bytes)`);

await upsertAsset(
  lessonFilename,
  lessonStep.config.assetUrl,
  lessonBuffer,
  "text/html",
);
await upsertAsset(
  mindmapFilename,
  mindmapStep.config.assetUrl,
  mindmapBuffer,
  "text/html",
);

const lessonConfig = {
  ...lessonStep.config,
  pageCount: slideCount,
  mimeType: "text/html",
  originalName: "relanto_ai_fundamentals_interactive.html",
};

await sql`
  UPDATE module_steps
  SET config = ${JSON.stringify(lessonConfig)}::jsonb
  WHERE module_id = ${MODULE_ID} AND step_type = 'pdf'
`;

await sql`
  UPDATE training_modules
  SET slide_count = ${slideCount}, updated_at = NOW()
  WHERE id = ${MODULE_ID}
`;

await pool.end();

console.log("Done. HTML assets and pageCount updated in Neon.");

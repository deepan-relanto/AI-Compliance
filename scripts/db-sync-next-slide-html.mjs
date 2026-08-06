/**
 * Push patched lesson + scenarios HTML for all course modules that have those steps.
 * Maps module title keywords → content-kit files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ASSETS_DIR = path.join(root, "public", "course-assets");
const HTML_DIR = path.join(root, "content-kit", "interactive-html");

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
const sql = neon(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BUNDLES = [
  {
    match: /fundamentals|ai basics|ai_basics/i,
    lesson: "relanto_ai_fundamentals_interactive.html",
    scenarios: "relanto_ai_scenarios_interactive.html",
  },
  {
    match: /security|privacy/i,
    lesson: "relanto_ai_security_privacy_compliance_interactive.html",
    scenarios: "relanto_ai_security_scenarios_interactive.html",
  },
  {
    match: /responsible|ethics/i,
    lesson: "relanto_responsible_ai_ethics_interactive.html",
    scenarios: "relanto_responsible_ai_scenarios_interactive.html",
  },
  {
    match: /prompt/i,
    lesson: "relanto_prompt_engineering_essentials_interactive.html",
    scenarios: "relanto_prompt_engineering_scenarios_interactive.html",
  },
];

function resolveBundle(moduleId, title) {
  const hay = `${moduleId} ${title}`;
  return BUNDLES.find((b) => b.match.test(hay)) ?? null;
}

function writeDiskAsset(filename, buffer, mimeType, originalName) {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ASSETS_DIR, filename), buffer);
  fs.writeFileSync(
    path.join(ASSETS_DIR, `${filename}.meta.json`),
    JSON.stringify({ mimeType, originalName, sizeBytes: buffer.length }),
  );
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

function slideCount(html) {
  return html.match(/<section\s+class="slide/gi)?.length ?? 1;
}

const modules = await sql`
  SELECT id, title FROM course_modules ORDER BY created_at
`;

for (const mod of modules) {
  const bundle = resolveBundle(String(mod.id), String(mod.title));
  if (!bundle) {
    console.log(`skip ${mod.id} (${mod.title}) — no bundle map`);
    continue;
  }

  const steps = await sql`
    SELECT step_type, config FROM course_module_steps WHERE module_id = ${mod.id}
  `;
  const lessonStep = steps.find((s) => s.step_type === "pdf");
  const scenariosStep = steps.find((s) => s.step_type === "scenarios");

  console.log(`\n${mod.title} [${mod.id}]`);

  if (lessonStep?.config?.assetUrl) {
    const filename = String(lessonStep.config.assetUrl).split("/").pop();
    const assetUrl = String(lessonStep.config.assetUrl);
    const html = fs.readFileSync(path.join(HTML_DIR, bundle.lesson), "utf8");
    const buffer = Buffer.from(html, "utf8");
    const pages = slideCount(html);
    writeDiskAsset(filename, buffer, "text/html", bundle.lesson);
    await upsertAsset(filename, assetUrl, buffer, "text/html");
    const cfg = { ...lessonStep.config, pageCount: pages, sizeBytes: buffer.length };
    if (typeof cfg.contentRevision === "number") cfg.contentRevision += 1;
    else cfg.contentRevision = 1;
    await sql`
      UPDATE course_module_steps
      SET config = ${JSON.stringify(cfg)}::jsonb, updated_at = NOW()
      WHERE module_id = ${mod.id} AND step_type = 'pdf'
    `;
    console.log(`  lesson → ${filename} (${pages} slides)`);
  }

  if (scenariosStep?.config?.assetUrl) {
    const filename = String(scenariosStep.config.assetUrl).split("/").pop();
    const assetUrl = String(scenariosStep.config.assetUrl);
    const htmlPath = path.join(HTML_DIR, bundle.scenarios);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf8");
      const buffer = Buffer.from(html, "utf8");
      writeDiskAsset(filename, buffer, "text/html", bundle.scenarios);
      await upsertAsset(filename, assetUrl, buffer, "text/html");
      const cfg = { ...scenariosStep.config, sizeBytes: buffer.length };
      if (typeof cfg.contentRevision === "number") cfg.contentRevision += 1;
      else cfg.contentRevision = 1;
      await sql`
        UPDATE course_module_steps
        SET config = ${JSON.stringify(cfg)}::jsonb, updated_at = NOW()
        WHERE module_id = ${mod.id} AND step_type = 'scenarios'
      `;
      console.log(`  scen.  → ${filename}`);
    }
  }
}

await pool.end();
console.log("\nDone.");

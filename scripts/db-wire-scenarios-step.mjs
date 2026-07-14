/**
 * Wire Scenario-Based Learning into AI basics:
 * - Expand Neon CHECK to allow step_type = 'scenarios'
 * - Renumber existing steps (pdf=1, scenarios=2, video=3, …)
 * - Store scenarios HTML on disk + Neon
 * - Insert course_module_steps row
 *
 * Usage: node scripts/db-wire-scenarios-step.mjs [moduleId]
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
const SCENARIOS_SRC = path.join(
  root,
  "content-kit",
  "interactive-html",
  "relanto_ai_scenarios_interactive.html",
);
const ORIGINAL_NAME = "relanto_ai_scenarios_interactive.html";

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

const TARGET_ORDER = ["pdf", "scenarios", "video", "mindmap", "infographic", "quiz"];

function writeDiskAsset(filename, buffer, mimeType, originalName) {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const filePath = path.join(ASSETS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  fs.writeFileSync(
    path.join(ASSETS_DIR, `${filename}.meta.json`),
    JSON.stringify({
      mimeType,
      originalName,
      sizeBytes: buffer.length,
    }),
  );
  console.log(`  disk   → ${filePath} (${buffer.length} bytes)`);
}

async function upsertAsset(filename, assetUrl, buffer, mimeType) {
  await sql`
    INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
    VALUES (${filename}, ${assetUrl}, ${mimeType}, ${buffer.length}, ${buffer})
    ON CONFLICT (filename) DO UPDATE SET
      asset_url = EXCLUDED.asset_url,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      data = EXCLUDED.data
  `;
  console.log(`  neon   → course_assets/${filename}`);
}

async function expandStepTypeCheck(table) {
  const exists = await sql`
    SELECT to_regclass(${table}) AS reg
  `;
  if (!exists[0]?.reg) {
    console.log(`  check  → ${table} not present, skip`);
    return;
  }
  const rows = await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = ${table}::regclass
      AND contype = 'c'
  `;
  const client = await pool.connect();
  try {
    for (const row of rows) {
      const def = String(row.def || "");
      if (!def.includes("step_type")) continue;
      if (def.includes("'scenarios'")) {
        console.log(`  check  → ${table}.${row.conname} already allows scenarios`);
        continue;
      }
      console.log(`  check  → dropping ${table}.${row.conname}`);
      await client.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${row.conname}`);
      await client.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${row.conname}
         CHECK (step_type IN ('pdf', 'scenarios', 'video', 'mindmap', 'infographic', 'quiz'))`,
      );
      console.log(`  check  → recreated ${table}.${row.conname} with scenarios`);
    }
  } finally {
    client.release();
  }
}

async function renumberSteps() {
  const steps = await sql`
    SELECT id, step_type, step_order
    FROM course_module_steps
    WHERE module_id = ${MODULE_ID}
    ORDER BY step_order
  `;
  console.log(`  steps  → ${steps.length} existing: ${steps.map((s) => `${s.step_type}@${s.step_order}`).join(", ")}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Phase 1: move to high temporary orders to avoid unique conflicts
    for (const step of steps) {
      await client.query(
        `UPDATE course_module_steps SET step_order = $1, updated_at = NOW() WHERE id = $2`,
        [1000 + Number(step.step_order), step.id],
      );
    }
    // Phase 2: assign final orders for known types (skip scenarios if already present)
    for (const step of steps) {
      const target = TARGET_ORDER.indexOf(step.step_type);
      if (target < 0) continue;
      await client.query(
        `UPDATE course_module_steps SET step_order = $1, updated_at = NOW() WHERE id = $2`,
        [target + 1, step.id],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (!fs.existsSync(SCENARIOS_SRC)) {
  console.error(`Missing source HTML: ${SCENARIOS_SRC}`);
  process.exit(1);
}

const html = fs.readFileSync(SCENARIOS_SRC, "utf8");
const buffer = Buffer.from(html, "utf8");
const slideCount = 7; // cover + picker + 5 path slides after selection

console.log(`Wiring scenarios into ${MODULE_ID}`);

await expandStepTypeCheck("course_module_steps");
try {
  await expandStepTypeCheck("module_steps");
} catch {
  /* legacy table may not exist */
}

await renumberSteps();

const existing = await sql`
  SELECT id, config, step_order
  FROM course_module_steps
  WHERE module_id = ${MODULE_ID} AND step_type = 'scenarios'
  LIMIT 1
`;

let filename;
let assetUrl;
if (existing[0]?.config?.assetUrl) {
  assetUrl = String(existing[0].config.assetUrl);
  filename = assetUrl.split("/").pop();
  console.log(`  reuse  → existing scenarios asset ${filename}`);
} else {
  filename = `${crypto.randomUUID()}.html`;
  assetUrl = `/course-assets/${filename}`;
  console.log(`  create → ${filename}`);
}

writeDiskAsset(filename, buffer, "text/html", ORIGINAL_NAME);
await upsertAsset(filename, assetUrl, buffer, "text/html");

const config = {
  assetUrl,
  originalName: ORIGINAL_NAME,
  mimeType: "text/html",
  pageCount: slideCount,
};

if (existing[0]) {
  await sql`
    UPDATE course_module_steps
    SET
      step_order = 2,
      title = ${"Scenario-based learning"},
      config = ${JSON.stringify(config)}::jsonb,
      updated_at = NOW()
    WHERE id = ${existing[0].id}
  `;
  console.log(`  step   → updated scenarios @ order 2`);
} else {
  await sql`
    INSERT INTO course_module_steps (module_id, step_order, step_type, title, config)
    VALUES (
      ${MODULE_ID},
      2,
      'scenarios',
      ${"Scenario-based learning"},
      ${JSON.stringify(config)}::jsonb
    )
  `;
  console.log(`  step   → inserted scenarios @ order 2`);
}

const finalSteps = await sql`
  SELECT step_order, step_type, config->>'originalName' AS name
  FROM course_module_steps
  WHERE module_id = ${MODULE_ID}
  ORDER BY step_order
`;
console.log("Final order:");
for (const s of finalSteps) {
  console.log(`  ${s.step_order}. ${s.step_type}${s.name ? ` (${s.name})` : ""}`);
}

await pool.end();
console.log("Done.");

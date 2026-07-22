/**
 * Quick verify for Responsible AI & Ethics module.
 * Usage: node scripts/db-verify-responsible-ai-ethics.mjs [moduleId]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ASSETS_DIR = path.join(root, "public", "course-assets");

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

const MODULE_ID =
  process.argv[2] || "course-responsible-ai-ethics-1784699962658";

const mod = await sql`
  SELECT id, title, duration_minutes, mcq_generation_status
  FROM course_modules WHERE id = ${MODULE_ID} LIMIT 1
`;
if (!mod.length) {
  console.error("Module not found:", MODULE_ID);
  process.exit(1);
}

const steps = await sql`
  SELECT step_order, step_type, title, config
  FROM course_module_steps WHERE module_id = ${MODULE_ID}
  ORDER BY step_order
`;
const q = await sql`
  SELECT COUNT(*)::int AS c FROM course_mcq_questions WHERE module_id = ${MODULE_ID}
`;
const opts = await sql`
  SELECT COUNT(*)::int AS c FROM course_mcq_options o
  JOIN course_mcq_questions qq ON qq.id = o.question_id
  WHERE qq.module_id = ${MODULE_ID}
`;
const batches = await sql`
  SELECT b.id FROM course_module_batches cmb
  JOIN batches b ON b.id = cmb.batch_id
  WHERE cmb.module_id = ${MODULE_ID}
`;

console.log("Module:", mod[0]);
console.log("Questions:", q[0].c, "options:", opts[0].c);
console.log("Batches:", batches.map((b) => b.id).join(", ") || "(none)");
console.log("Steps:");

let ok = true;
const required = ["pdf", "scenarios", "video", "mindmap", "infographic", "quiz"];
for (const t of required) {
  if (!steps.find((s) => s.step_type === t)) {
    console.log(`  ❌ missing step ${t}`);
    ok = false;
  }
}

for (const step of steps) {
  const cfg =
    typeof step.config === "string" ? JSON.parse(step.config) : step.config || {};
  if (step.step_type === "quiz") {
    const pass = Number(q[0].c) >= 20;
    console.log(
      `  ${pass ? "✅" : "❌"} ${step.step_order}. quiz questionCount=${cfg.questionCount} db=${q[0].c}`,
    );
    if (!pass) ok = false;
    continue;
  }
  const assetUrl = cfg.assetUrl;
  const filename = String(assetUrl || "").replace("/course-assets/", "");
  const neonRows = await sql`
    SELECT size_bytes, mime_type FROM course_assets WHERE filename = ${filename} LIMIT 1
  `;
  const disk = fs.existsSync(path.join(ASSETS_DIR, filename));
  const neonOk = neonRows.length > 0 && Number(neonRows[0].size_bytes) > 0;
  const pass = Boolean(assetUrl) && neonOk && disk;
  console.log(
    `  ${pass ? "✅" : "❌"} ${step.step_order}. ${step.step_type} ${assetUrl} neon=${neonRows[0]?.size_bytes ?? 0} disk=${disk}`,
  );
  if (!pass) ok = false;
}

const scenes = [
  "hr",
  "sales",
  "marketing",
  "operations",
  "pm",
  "support",
  "leadership",
  "finance",
  "general",
];
console.log("Scenario scenes:");
for (const id of scenes) {
  const p = path.join(ASSETS_DIR, "scenario-scenes", `scene-${id}.webp`);
  const exists = fs.existsSync(p);
  console.log(`  ${exists ? "✅" : "❌"} scene-${id}.webp`);
  if (!exists) ok = false;
}

if (!ok) {
  console.error("\nVerification FAILED");
  process.exit(1);
}
console.log("\n✅ Responsible AI & Ethics bundle verified");

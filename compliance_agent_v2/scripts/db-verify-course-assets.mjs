/**
 * Verify every course_assets row can be read and matches an active module step (if referenced).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

const sql = neon(process.env.DATABASE_URL);

const assets = await sql`
  SELECT filename, asset_url, mime_type, size_bytes,
         octet_length(data) AS data_len
  FROM course_assets
  ORDER BY filename
`;

console.log("=== course_assets in Neon ===");
let bad = 0;
for (const a of assets) {
  const size = Number(a.size_bytes);
  const len = Number(a.data_len);
  const ok = size > 0 && len === size;
  if (!ok) bad++;
  console.log(
    `${ok ? "OK" : "BAD"} ${a.filename} mime=${a.mime_type} size=${size} data_len=${len} url=${a.asset_url}`,
  );
}

const steps = await sql`
  SELECT tm.id AS module_id, tm.title, ms.step_type, ms.config->>'assetUrl' AS asset_url
  FROM module_steps ms
  JOIN training_modules tm ON tm.id = ms.module_id
  WHERE tm.module_kind = 'course'
    AND ms.config->>'assetUrl' IS NOT NULL
`;

console.log("\n=== course step assets (must exist in Neon) ===");
for (const s of steps) {
  const filename = String(s.asset_url).split("/").pop();
  const found = assets.find((a) => a.filename === filename);
  const ok = Boolean(found);
  if (!ok) bad++;
  console.log(
    `${ok ? "OK" : "MISSING"} ${s.title} / ${s.step_type} → ${s.asset_url}`,
  );
}

const clientUrl = (u) =>
  u?.startsWith("/course-assets/") ? `/api/files${u}` : u;

console.log("\n=== learner URLs (clientCourseAssetUrl) ===");
for (const s of steps) {
  console.log(`  ${s.step_type}: ${clientUrl(s.asset_url)}`);
}

if (bad > 0) {
  console.error(`\nFAILED: ${bad} problem(s)`);
  process.exit(1);
}
console.log(`\nPASSED: ${assets.length} assets readable; all course step files found.`);

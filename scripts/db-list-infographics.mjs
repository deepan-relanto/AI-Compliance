/**
 * List every infographic step with its module and current asset.
 * Usage: node scripts/db-list-infographics.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

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

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const rows = await sql`
  SELECT s.id, s.module_id, s.step_order, s.config, m.title, m.created_at
  FROM course_module_steps s
  JOIN course_modules m ON m.id = s.module_id
  WHERE s.step_type = 'infographic'
  ORDER BY m.created_at, s.step_order
`;

for (const r of rows) {
  const cfg = r.config ?? {};
  console.log(
    [
      r.title,
      `module=${r.module_id}`,
      `step=${r.step_order}`,
      `asset=${cfg.assetUrl}`,
      `mime=${cfg.mimeType}`,
      `name=${cfg.originalName}`,
    ].join("\n  "),
  );
  console.log("");
}

const assets = await sql`
  SELECT filename, mime_type, size_bytes FROM course_assets
  WHERE mime_type LIKE 'image/%'
  ORDER BY filename
`;
console.log("image assets in db:");
for (const a of assets) {
  console.log(`  ${a.filename}  ${a.mime_type}  ${a.size_bytes} bytes`);
}

await sql.end();

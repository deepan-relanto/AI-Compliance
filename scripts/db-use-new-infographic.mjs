/**
 * Publish the user-provided infographic PNG to Neon and point all
 * infographic course steps at it.
 * Usage: node scripts/db-use-new-infographic.mjs <path-to-png>
 */
import crypto from "node:crypto";
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

const sourcePath = process.argv[2];
if (!sourcePath || !fs.existsSync(sourcePath)) {
  console.error("Provide a valid path to the new infographic PNG.");
  process.exit(1);
}

const data = fs.readFileSync(sourcePath);
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const newFilename = `${crypto.randomUUID()}.png`;
const newUrl = `/course-assets/${newFilename}`;

await sql`
  INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
  VALUES (${newFilename}, ${newUrl}, ${"image/png"}, ${data.length}, ${data})
`;

const steps = await sql`
  SELECT id, module_id, config
  FROM course_module_steps
  WHERE step_type = 'infographic'
`;

let updated = 0;
for (const step of steps) {
  const config = {
    ...(step.config ?? {}),
    assetUrl: newUrl,
    originalName: "Enterprise_AI_Workplace_Essentials.png",
    mimeType: "image/png",
  };
  await sql`
    UPDATE course_module_steps
    SET config = ${sql.json(config)}
    WHERE id = ${step.id}
  `;
  updated += 1;
  console.log(`Updated infographic step in ${step.module_id}`);
}

const publicPath = path.join(root, "public", "course-assets", newFilename);
fs.mkdirSync(path.dirname(publicPath), { recursive: true });
fs.writeFileSync(publicPath, data);
fs.writeFileSync(
  `${publicPath}.meta.json`,
  JSON.stringify({
    mimeType: "image/png",
    originalName: "Enterprise_AI_Workplace_Essentials.png",
    sizeBytes: data.length,
  }),
);

console.log({ newFilename, newUrl, sizeBytes: data.length, stepsUpdated: updated });
await sql.end();

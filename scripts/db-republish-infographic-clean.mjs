/**
 * Publish a clean infographic under a NEW filename so browser caches of the
 * old NotebookLM asset cannot win, and re-point all infographic steps.
 *
 * Usage: node scripts/db-republish-infographic-clean.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const OLD_FILENAME = "4b1d374a-8ad9-431d-9ea1-83e0c335401b.png";
const OLD_URL = `/course-assets/${OLD_FILENAME}`;

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
  SELECT data FROM course_assets WHERE filename = ${OLD_FILENAME} LIMIT 1
`;
if (!rows.length) {
  console.error("Source asset missing");
  process.exit(1);
}

let buf = Buffer.from(rows[0].data);
const meta = await sharp(buf).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;

// Paint a larger bottom-right corner white (logo + label), flush to edges.
const coverW = Math.round(width * 0.28);
const coverH = Math.round(height * 0.1);
const overlay = await sharp({
  create: {
    width: coverW,
    height: coverH,
    channels: 3,
    background: { r: 255, g: 255, b: 255 },
  },
})
  .png()
  .toBuffer();

buf = await sharp(buf)
  .composite([{ input: overlay, left: width - coverW, top: height - coverH }])
  .png()
  .toBuffer();

const newFilename = `${crypto.randomUUID()}.png`;
const newUrl = `/course-assets/${newFilename}`;

await sql`
  INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
  VALUES (${newFilename}, ${newUrl}, ${"image/png"}, ${buf.length}, ${buf})
  ON CONFLICT (filename) DO UPDATE SET
    asset_url = EXCLUDED.asset_url,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    data = EXCLUDED.data
`;

const steps = await sql`
  SELECT id, module_id, config
  FROM course_module_steps
  WHERE step_type = 'infographic'
    AND (
      config->>'assetUrl' = ${OLD_URL}
      OR config->>'originalName' = 'Enterprise_AI_Workplace_Essentials.png'
    )
`;

for (const step of steps) {
  const config = { ...(step.config ?? {}) };
  config.assetUrl = newUrl;
  config.originalName = "Enterprise_AI_Workplace_Essentials.png";
  config.mimeType = "image/png";
  await sql`
    UPDATE course_module_steps
    SET config = ${sql.json(config)}
    WHERE id = ${step.id}
  `;
  console.log(`Updated step ${step.id} on ${step.module_id}`);
}

const outDir = path.join(root, "content-kit", "infographic");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "Enterprise_AI_Workplace_Essentials.png"), buf);
const publicPath = path.join(root, "public", "course-assets", newFilename);
fs.mkdirSync(path.dirname(publicPath), { recursive: true });
fs.writeFileSync(publicPath, buf);
fs.writeFileSync(
  `${publicPath}.meta.json`,
  JSON.stringify({
    mimeType: "image/png",
    originalName: "Enterprise_AI_Workplace_Essentials.png",
    sizeBytes: buf.length,
  }),
);

// Verify bottom-right is white
const check = await sharp(buf)
  .extract({ left: width - 400, top: height - 100, width: 400, height: 100 })
  .raw()
  .toBuffer({ resolveWithObject: true });
let dark = 0;
for (let i = 0; i < check.data.length; i += 3) {
  if (check.data[i] < 245 || check.data[i + 1] < 245 || check.data[i + 2] < 245) dark++;
}
console.log({
  newFilename,
  newUrl,
  stepsUpdated: steps.length,
  darkPixelsInBR: dark,
  ok: dark === 0,
});

await sql.end();
if (dark > 0) process.exit(2);

/**
 * Replace the full Human Accountability caption (3 lines) so nothing is clipped.
 * Usage: node scripts/db-fix-infographic-crop.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const LOCAL = path.join(
  root,
  "content-kit",
  "infographic",
  "Enterprise_AI_Workplace_Essentials.png",
);
const PEACH = { r: 252, g: 228, b: 204 };
const PAPER = { r: 255, g: 255, b: 255 };

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

const SOURCE = "b35b88ac-f800-4443-b1c1-d5aa51098d7b.png";
const rows = await sql`
  SELECT data FROM course_assets WHERE filename = ${SOURCE} LIMIT 1
`;
if (!rows.length) {
  console.error("Source missing");
  process.exit(1);
}

const sourceBuf = Buffer.from(rows[0].data);
const meta = await sharp(sourceBuf).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;

const padBottom = 48;
const newHeight = height + padBottom;

// Narrow column under the HA title (avoid clock + person art).
const coverLeft = Math.round(width * 0.62);
const coverTop = Math.round(height * 0.855);
const coverW = Math.round(width * 0.20);
const coverH = height - coverTop + padBottom;
const fontSize = 22;
const lineGap = 30;
const textBlockH = fontSize + lineGap * 2 + 28;

const captionSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${coverW}" height="${coverH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="${textBlockH}" fill="rgb(${PAPER.r},${PAPER.g},${PAPER.b})"/>
  <rect y="${textBlockH}" width="100%" height="${coverH - textBlockH}" fill="rgb(${PEACH.r},${PEACH.g},${PEACH.b})"/>
  <text x="0" y="${fontSize}"
        font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="600"
        fill="#111111">
    <tspan x="0" dy="0">You remain responsible for</tspan>
    <tspan x="0" dy="${lineGap}">all AI-generated output used</tspan>
    <tspan x="0" dy="${lineGap}">in client work or decisions</tspan>
  </text>
  <rect x="0" y="${textBlockH - 10}" width="${Math.round(coverW * 0.55)}" height="3" fill="#1e3a8a"/>
</svg>`);

const fixed = await sharp(sourceBuf)
  .extend({
    top: 0,
    bottom: padBottom,
    left: 0,
    right: 0,
    background: PEACH,
  })
  .composite([
    {
      input: await sharp(captionSvg).png().toBuffer(),
      left: coverLeft,
      top: coverTop,
    },
  ])
  .png()
  .toBuffer();

const newFilename = `${crypto.randomUUID()}.png`;
const newUrl = `/course-assets/${newFilename}`;

await sql`
  INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
  VALUES (${newFilename}, ${newUrl}, ${"image/png"}, ${fixed.length}, ${fixed})
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
`;

let updated = 0;
for (const step of steps) {
  const blob = `${JSON.stringify(step.config ?? {})} ${step.module_id}`;
  if (!/Workplace_Essentials|ai-basics/i.test(blob)) continue;
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
  console.log(`Updated ${step.module_id}`);
}

fs.writeFileSync(LOCAL, fixed);
const publicPath = path.join(root, "public", "course-assets", newFilename);
fs.mkdirSync(path.dirname(publicPath), { recursive: true });
fs.writeFileSync(publicPath, fixed);
fs.writeFileSync(
  `${publicPath}.meta.json`,
  JSON.stringify({
    mimeType: "image/png",
    originalName: "Enterprise_AI_Workplace_Essentials.png",
    sizeBytes: fixed.length,
  }),
);

const preview = path.join(root, "content-kit", "infographic", "_ha-preview.png");
await sharp(fixed)
  .extract({
    left: Math.round(width * 0.52),
    top: Math.round(newHeight * 0.78),
    width: Math.round(width * 0.4),
    height: Math.round(newHeight * 0.22),
  })
  .png()
  .toFile(preview);

console.log({
  newFilename,
  newUrl,
  to: `${width}x${newHeight}`,
  cover: { coverLeft, coverTop, coverW, coverH },
  updated,
});
await sql.end();

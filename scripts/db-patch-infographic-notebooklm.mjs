/**
 * Export Enterprise_AI_Workplace_Essentials.png from Neon, cover the
 * bottom-right NotebookLM watermark, upsert back into course_assets.
 *
 * Usage: node scripts/db-patch-infographic-notebooklm.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FILENAME = "4b1d374a-8ad9-431d-9ea1-83e0c335401b.png";
const ASSET_URL = `/course-assets/${FILENAME}`;
const OUT_DIR = path.join(root, "content-kit", "infographic");
const OUT_FILE = path.join(OUT_DIR, "Enterprise_AI_Workplace_Essentials.png");

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

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const rows = await sql`
  SELECT filename, asset_url, mime_type, data
  FROM course_assets
  WHERE filename = ${FILENAME} OR asset_url = ${ASSET_URL}
  LIMIT 1
`;

if (!rows.length || !rows[0].data) {
  console.error(`Asset not found: ${FILENAME}`);
  await sql.end();
  process.exit(1);
}

const original = Buffer.from(rows[0].data);
const meta = await sharp(original).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;
if (!width || !height) {
  console.error("Could not read image dimensions.");
  await sql.end();
  process.exit(1);
}

// NotebookLM mark sits flush in the bottom-right corner of the white canvas.
// Cover a generous corner so logo + label are fully painted out.
const coverW = Math.max(320, Math.round(width * 0.22));
const coverH = Math.max(90, Math.round(height * 0.075));
const left = width - coverW;
const top = height - coverH;

console.log(`Image ${width}x${height}; covering ${coverW}x${coverH} at (${left},${top})`);

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

const patched = await sharp(original)
  .composite([{ input: overlay, left, top }])
  .png()
  .toBuffer();

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, patched);
const publicPath = path.join(root, "public", "course-assets", FILENAME);
fs.mkdirSync(path.dirname(publicPath), { recursive: true });
fs.writeFileSync(publicPath, patched);

await sql`
  INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
  VALUES (
    ${FILENAME},
    ${ASSET_URL},
    ${"image/png"},
    ${patched.length},
    ${patched}
  )
  ON CONFLICT (filename) DO UPDATE SET
    asset_url = EXCLUDED.asset_url,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    data = EXCLUDED.data
`;

console.log(`Patched Neon + wrote:`);
console.log(`  ${OUT_FILE}`);
console.log(`  ${publicPath}`);
console.log(`  size ${original.length} → ${patched.length}`);

await sql.end();

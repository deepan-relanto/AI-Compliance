/**
 * Publish the rebuilt vector infographics (see scripts/build-infographics.mjs)
 * and repoint the matching course steps at the new high-resolution assets.
 *
 * Modules 2, 3 and 4 are swapped by their current asset URL, so the module 1
 * infographic is never touched. Old assets are left in place for rollback.
 *
 * Usage: node scripts/db-publish-infographics.mjs [--dry]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const buildDir = path.join(root, "content-kit", "infographics");
const publicDir = path.join(root, "public", "course-assets");

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

const dryRun = process.argv.includes("--dry");

const SWAPS = [
  {
    module: 2,
    replaces: "/course-assets/2078f0ee-f585-4ff8-b332-62579afcebbc.png",
    file: "module-2-responsible-ai-ethics.png",
    originalName: "Responsible_AI_How_to_Own_Your_Outcomes.png",
  },
  {
    module: 3,
    replaces: "/course-assets/4bd1e6b9-f934-4ba3-8069-2e47c7394148.png",
    file: "module-3-ai-security-privacy-compliance.png",
    originalName: "AI_Security_Privacy_Compliance_Reference.png",
  },
  {
    module: 4,
    replaces: "/course-assets/d9859d1d-b359-4913-b547-6c503b28fa83.png",
    file: "module-4-prompt-engineering-essentials.png",
    originalName: "Prompt_Engineering_Essentials_Reference.png",
  },
];

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

fs.mkdirSync(publicDir, { recursive: true });

for (const swap of SWAPS) {
  const sourcePath = path.join(buildDir, swap.file);
  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing render for module ${swap.module}: ${sourcePath}`);
    console.error("Run: node scripts/build-infographics.mjs");
    process.exitCode = 1;
    continue;
  }
  const data = fs.readFileSync(sourcePath);

  const steps = await sql`
    SELECT s.id, s.module_id, s.config, m.title
    FROM course_module_steps s
    JOIN course_modules m ON m.id = s.module_id
    WHERE s.step_type = 'infographic'
      AND s.config->>'assetUrl' = ${swap.replaces}
  `;

  console.log(
    `Module ${swap.module}: ${Math.round(data.length / 1024)} KB → ${steps.length} step(s)`,
  );
  if (!steps.length) {
    console.warn(`  ! no step still points at ${swap.replaces}`);
    continue;
  }

  const filename = `${crypto.randomUUID()}.png`;
  const assetUrl = `/course-assets/${filename}`;

  if (dryRun) {
    for (const step of steps) console.log(`  (dry) ${step.title} → ${assetUrl}`);
    continue;
  }

  await sql`
    INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
    VALUES (${filename}, ${assetUrl}, ${"image/png"}, ${data.length}, ${data})
    ON CONFLICT (filename) DO UPDATE SET
      asset_url = EXCLUDED.asset_url,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      data = EXCLUDED.data
  `;

  for (const step of steps) {
    const config = {
      ...(step.config ?? {}),
      assetUrl,
      originalName: swap.originalName,
      mimeType: "image/png",
      sizeBytes: data.length,
    };
    await sql`
      UPDATE course_module_steps
      SET config = ${sql.json(config)}
      WHERE id = ${step.id}
    `;
    console.log(`  ✓ ${step.title} (${step.module_id})`);
  }

  fs.writeFileSync(path.join(publicDir, filename), data);
  fs.writeFileSync(
    path.join(publicDir, `${filename}.meta.json`),
    JSON.stringify({
      mimeType: "image/png",
      originalName: swap.originalName,
      sizeBytes: data.length,
    }),
  );
  console.log(`  ✓ mirrored public/course-assets/${filename}`);
}

await sql.end();
console.log(dryRun ? "Dry run complete." : "Published.");

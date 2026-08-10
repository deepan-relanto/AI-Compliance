/**
 * Render the course infographics from their SVG sources.
 *
 * The artwork is authored as vector SVG (see scripts/infographics/) and
 * rasterised here at 2x so the player, which stretches the image to the full
 * stage width, always downsamples instead of upscaling.
 *
 * Usage: node scripts/build-infographics.mjs [2|3|4 ...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { render as renderModule2 } from "./infographics/module-2-responsible-ai.mjs";
import { render as renderModule3 } from "./infographics/module-3-security-privacy.mjs";
import { render as renderModule4 } from "./infographics/module-4-prompt-engineering.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "content-kit", "infographics");

/** 144 DPI against the SVG's 72pt baseline renders the 1600x900 board at 2x. */
const RASTER_DENSITY = 144;

const TARGETS = [
  {
    module: 2,
    slug: "module-2-responsible-ai-ethics",
    originalName: "Responsible_AI_Ethics_Reference.png",
    render: renderModule2,
  },
  {
    module: 3,
    slug: "module-3-ai-security-privacy-compliance",
    originalName: "AI_Security_Privacy_Compliance_Reference.png",
    render: renderModule3,
  },
  {
    module: 4,
    slug: "module-4-prompt-engineering-essentials",
    originalName: "Prompt_Engineering_Essentials_Reference.png",
    render: renderModule4,
  },
];

const only = process.argv.slice(2).map(Number).filter(Boolean);
const targets = only.length ? TARGETS.filter((t) => only.includes(t.module)) : TARGETS;

fs.mkdirSync(outDir, { recursive: true });

for (const target of targets) {
  console.log(`Module ${target.module}: ${target.slug}`);
  const svg = target.render();
  const svgPath = path.join(outDir, `${target.slug}.svg`);
  fs.writeFileSync(svgPath, svg, "utf8");

  const pngPath = path.join(outDir, `${target.slug}.png`);
  const info = await sharp(Buffer.from(svg), { density: RASTER_DENSITY })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(pngPath);

  console.log(
    `  → ${path.relative(root, pngPath)}  ${info.width}x${info.height}  ${Math.round(
      info.size / 1024,
    )} KB`,
  );
}

console.log("Done.");

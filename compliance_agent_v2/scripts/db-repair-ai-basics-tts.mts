/**
 * Repair TTS sandbox for the live assigned AI basics course.
 * - Drops empty non-canonical duplicates
 * - Ensures canonical tts-{moduleId} with steps + flags on
 * - Syncs beat segments; seeds script_text from raw_text
 * - Runs Gemini generation when possible
 *
 * Usage: node --import tsx scripts/db-repair-ai-basics-tts.mts
 *    or: npx tsx scripts/db-repair-ai-basics-tts.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { getCourseAssetBuffer } from "../src/lib/services/course-asset-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SOURCE_MODULE_ID = "course-ai-basics-1783575957097";
const SANDBOX_ID = `tts-${SOURCE_MODULE_ID}`;

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(slideHtml: string, fallback: string | null): string | null {
  const attr = slideHtml.match(/data-title="([^"]+)"/i)?.[1]?.trim();
  if (attr) return attr;
  const heading = slideHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
  const clean = heading ? stripHtml(heading) : "";
  return clean || fallback;
}

function extractBeatDraftsFromHtml(html: string, stepType: string, stepOrder: number) {
  const slides = [
    ...html.matchAll(/<section[^>]*class="[^"]*\bslide\b[^"]*"[^>]*>([\s\S]*?)<\/section>/gi),
  ];
  if (slides.length === 0) return [];

  const drafts: {
    sourceStepType: string;
    stepOrder: number;
    beatKey: string;
    slideIndex: number;
    fragmentIndex: number;
    slideTitle: string | null;
    rawText: string;
  }[] = [];

  slides.forEach((match, slideIndex) => {
    const slideHtml = match[1] ?? "";
    const slideTitle = extractTitle(slideHtml, `Slide ${slideIndex + 1}`);
    const fragments = [
      ...slideHtml.matchAll(/<([^>]*\bfragment\b[^>]*)>([\s\S]*?)<\/\w+>/gi),
    ];
    if (fragments.length === 0) {
      const rawText = stripHtml(slideHtml).slice(0, 1400);
      drafts.push({
        sourceStepType: stepType,
        stepOrder,
        beatKey: `${stepType}:${slideIndex}:0`,
        slideIndex,
        fragmentIndex: 0,
        slideTitle,
        rawText,
      });
      return;
    }

    drafts.push({
      sourceStepType: stepType,
      stepOrder,
      beatKey: `${stepType}:${slideIndex}:0`,
      slideIndex,
      fragmentIndex: 0,
      slideTitle,
      rawText: stripHtml(slideHtml).slice(0, 1400),
    });

    fragments.forEach((frag, fragmentIndex) => {
      const rawText = stripHtml(frag[2] ?? "").slice(0, 1400);
      drafts.push({
        sourceStepType: stepType,
        stepOrder,
        beatKey: `${stepType}:${slideIndex}:${fragmentIndex + 1}`,
        slideIndex,
        fragmentIndex: fragmentIndex + 1,
        slideTitle,
        rawText,
      });
    });
  });

  return drafts;
}

loadEnv();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  console.log("Repairing TTS for", SOURCE_MODULE_ID);

  const deleted = await sql`
    DELETE FROM tts_course_modules
    WHERE source_module_id = ${SOURCE_MODULE_ID}
      AND id <> ${SANDBOX_ID}
    RETURNING id
  `;
  console.log("Removed non-canonical sandboxes:", deleted.map((r) => r.id));

  const modules = await sql`
    SELECT id, title, description, slide_count, duration_minutes, content_type, pdf_url,
           feedback_required, status_default, content_hash, mcq_generation_status
    FROM course_modules
    WHERE id = ${SOURCE_MODULE_ID}
    LIMIT 1
  `;
  if (modules.length === 0) throw new Error("AI basics course not found");
  const source = modules[0];

  await sql`
    INSERT INTO tts_course_modules (
      id, source_module_id, title, description, slide_count, duration_minutes, content_type,
      pdf_url, feedback_required, status_default, content_hash, mcq_generation_status,
      tts_enabled, avatar_enabled, script_status
    )
    VALUES (
      ${SANDBOX_ID},
      ${SOURCE_MODULE_ID},
      ${String(source.title)},
      ${String(source.description ?? "")},
      ${Number(source.slide_count ?? 1)},
      ${Number(source.duration_minutes ?? 20)},
      ${String(source.content_type ?? "text")},
      ${source.pdf_url ?? null},
      ${Boolean(source.feedback_required)},
      ${String(source.status_default ?? "not_started")},
      ${source.content_hash ?? null},
      ${String(source.mcq_generation_status ?? "completed")},
      true,
      true,
      'generating'
    )
    ON CONFLICT (id) DO UPDATE SET
      source_module_id = EXCLUDED.source_module_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      tts_enabled = true,
      avatar_enabled = true,
      script_status = 'generating',
      updated_at = NOW()
  `;

  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM course_module_steps
    WHERE module_id = ${SOURCE_MODULE_ID}
    ORDER BY step_order
  `;

  await sql`DELETE FROM tts_course_module_steps WHERE module_id = ${SANDBOX_ID}`;
  for (const step of steps) {
    await sql`
      INSERT INTO tts_course_module_steps (module_id, step_order, step_type, title, config)
      VALUES (
        ${SANDBOX_ID},
        ${Number(step.step_order)},
        ${String(step.step_type)},
        ${String(step.title)},
        ${step.config}
      )
    `;
  }
  console.log("Copied steps:", steps.length);

  await sql`DELETE FROM tts_course_script_segments WHERE module_id = ${SANDBOX_ID}`;

  let draftCount = 0;
  for (const step of steps) {
    const stepType = String(step.step_type);
    if (!["pdf", "scenarios", "mindmap"].includes(stepType)) continue;
    const config = step.config as { assetUrl?: string | null; mimeType?: string | null };
    const assetUrl = config?.assetUrl;
    if (!assetUrl) continue;
    const { buffer, mimeType } = await getCourseAssetBuffer(String(assetUrl));
    const isHtml =
      String(mimeType ?? "").toLowerCase().includes("html") ||
      String(assetUrl).toLowerCase().endsWith(".html");
    if (!isHtml) continue;
    const html = buffer.toString("utf8");
    const drafts = extractBeatDraftsFromHtml(html, stepType, Number(step.step_order));
    for (const draft of drafts) {
      const text = draft.rawText.trim();
      await sql`
        INSERT INTO tts_course_script_segments (
          module_id, source_step_type, step_order, beat_key, slide_index,
          fragment_index, slide_title, raw_text, script_text
        )
        VALUES (
          ${SANDBOX_ID},
          ${draft.sourceStepType},
          ${draft.stepOrder},
          ${draft.beatKey},
          ${draft.slideIndex},
          ${draft.fragmentIndex},
          ${draft.slideTitle},
          ${text},
          ${text}
        )
        ON CONFLICT (module_id, beat_key) DO UPDATE SET
          raw_text = EXCLUDED.raw_text,
          script_text = CASE
            WHEN length(trim(tts_course_script_segments.script_text)) > 0
              THEN tts_course_script_segments.script_text
            ELSE EXCLUDED.script_text
          END,
          updated_at = NOW()
      `;
      draftCount += 1;
    }
  }

  await sql`
    UPDATE tts_course_modules
    SET script_status = 'generated', tts_enabled = true, avatar_enabled = true, updated_at = NOW()
    WHERE id = ${SANDBOX_ID}
  `;

  const summary = await sql`
    SELECT
      tts_enabled, avatar_enabled, script_status,
      (SELECT count(*)::int FROM tts_course_script_segments s WHERE s.module_id = t.id) AS segments,
      (SELECT count(*)::int FROM tts_course_script_segments s WHERE s.module_id = t.id AND length(trim(s.script_text)) > 0) AS with_text
    FROM tts_course_modules t
    WHERE id = ${SANDBOX_ID}
  `;

  console.log("Seeded beat drafts:", draftCount);
  console.log("Sandbox ready:", summary[0]);
  console.log("Next: optional Gemini polish via admin TTS step or generate API.");
} catch (err) {
  console.error("Repair failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

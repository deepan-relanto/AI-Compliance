/**
 * Create / refresh the full Responsible AI & Ethics course bundle in Neon.
 *
 * Assets:
 *  - lesson HTML, scenarios HTML, mindmap HTML
 *  - video MP4, infographic PNG
 *  - 20-question quiz bank
 *
 * Usage:
 *   node scripts/db-seed-responsible-ai-ethics.mjs
 *   node scripts/db-seed-responsible-ai-ethics.mjs --reuse <existingModuleId>
 *   node scripts/db-seed-responsible-ai-ethics.mjs --no-batches
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ASSETS_DIR = path.join(root, "public", "course-assets");
const HTTP_SAFE = 40 * 1024 * 1024;

const TITLE = "Responsible AI & Ethics";
const DESCRIPTION =
  "Use AI in ways that are fair, transparent, and defensible — principles, PACT, misuse risks, and workplace habits.";
const DURATION_MINUTES = 45;

const LESSON_SRC = path.join(
  root,
  "content-kit",
  "interactive-html",
  "relanto_responsible_ai_ethics_interactive.html",
);
const SCENARIOS_SRC = path.join(
  root,
  "content-kit",
  "interactive-html",
  "relanto_responsible_ai_scenarios_interactive.html",
);
const MINDMAP_SRC = path.join(
  root,
  "content-kit",
  "mindmap-html",
  "mindmap-responsible-ai-ethics.html",
);
const INFOGRAPHIC_SRC = path.join(
  root,
  "content-kit",
  "infographic",
  "Responsible_AI_How_to_Own_Your_Outcomes.png",
);
const VIDEO_CANDIDATES = [
  path.join(root, "content-kit", "video", "Responsible_AI_Ethics.mp4"),
  path.join(
    process.env.USERPROFILE || "",
    "Downloads",
    "Responsible_AI___Ethics.mp4",
  ),
];
const QUIZ_SRC = path.join(
  root,
  "content-kit",
  "interactive-html",
  "responsible_ai_ethics_questions.json",
);

const STEP_LABELS = {
  pdf: "Interactive HTML lesson",
  scenarios: "Scenario-based learning",
  video: "Training video",
  mindmap: "Interactive HTML mind map",
  infographic: "Infographics",
  quiz: "Assessment quiz",
};

const STEP_ORDER = {
  pdf: 1,
  scenarios: 2,
  video: 3,
  mindmap: 4,
  infographic: 5,
  quiz: 6,
};

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

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseArgs(argv) {
  const out = { reuse: null, noBatches: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--reuse" && argv[i + 1]) {
      out.reuse = argv[++i];
    } else if (argv[i] === "--no-batches") {
      out.noBatches = true;
    }
  }
  return out;
}

function requireFile(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${label}: ${p}`);
  }
  return p;
}

function resolveVideo() {
  for (const p of VIDEO_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error(
    `Missing video. Expected one of:\n${VIDEO_CANDIDATES.map((p) => `  - ${p}`).join("\n")}`,
  );
}

function writeDiskAsset(filename, buffer, mimeType, originalName) {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ASSETS_DIR, filename), buffer);
  fs.writeFileSync(
    path.join(ASSETS_DIR, `${filename}.meta.json`),
    JSON.stringify({ mimeType, originalName, sizeBytes: buffer.length }),
  );
}

loadEnv();
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL || process.env.postgres_neon;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const args = parseArgs(process.argv);
const sql = neon(url);
const pool = new Pool({ connectionString: url });

async function upsertAsset(filename, assetUrl, buffer, mimeType) {
  if (buffer.length <= HTTP_SAFE) {
    await sql`
      INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
      VALUES (${filename}, ${assetUrl}, ${mimeType}, ${buffer.length}, ${buffer})
      ON CONFLICT (filename) DO UPDATE SET
        asset_url = EXCLUDED.asset_url,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        data = EXCLUDED.data
    `;
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (filename) DO UPDATE SET
         asset_url = EXCLUDED.asset_url,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         data = EXCLUDED.data`,
      [filename, assetUrl, mimeType, buffer.length, buffer],
    );
  } finally {
    client.release();
  }
}

async function storeMediaAsset({ srcPath, originalName, mimeType, ext }) {
  const buffer = fs.readFileSync(srcPath);
  const filename = `${crypto.randomUUID()}${ext}`;
  const assetUrl = `/course-assets/${filename}`;
  writeDiskAsset(filename, buffer, mimeType, originalName);
  await upsertAsset(filename, assetUrl, buffer, mimeType);
  console.log(
    `  ✅ ${originalName} → ${assetUrl} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
  );
  return { assetUrl, originalName, mimeType, sizeBytes: buffer.length };
}

async function upsertStep(moduleId, stepType, config) {
  const order = STEP_ORDER[stepType];
  const title = STEP_LABELS[stepType];
  const configJson = JSON.stringify(config);
  await sql`
    INSERT INTO course_module_steps (module_id, step_order, step_type, title, config)
    VALUES (${moduleId}, ${order}, ${stepType}, ${title}, ${configJson}::jsonb)
    ON CONFLICT (module_id, step_type) DO UPDATE SET
      step_order = EXCLUDED.step_order,
      title = EXCLUDED.title,
      config = EXCLUDED.config,
      updated_at = NOW()
  `;
  console.log(`  step  → ${order}. ${stepType}`);
}

function normalizeCorrect(correctOptionId, correctOptionIds) {
  if (Array.isArray(correctOptionIds) && correctOptionIds.length) {
    return correctOptionIds.map((x) => String(x).trim().toLowerCase()).join(",");
  }
  if (correctOptionId == null) return null;
  return String(correctOptionId)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
}

async function importQuiz(moduleId, questions) {
  await sql`DELETE FROM course_mcq_options WHERE question_id IN (
    SELECT id FROM course_mcq_questions WHERE module_id = ${moduleId}
  )`;
  await sql`DELETE FROM course_mcq_questions WHERE module_id = ${moduleId}`;

  let imported = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const optionIds = new Set(q.options.map((o) => String(o.id).trim().toLowerCase()));
    const correctStored = normalizeCorrect(q.correctOptionId, q.correctOptionIds);
    if (!correctStored) throw new Error(`Question ${i + 1}: missing correct answer`);
    for (const id of correctStored.split(",")) {
      if (!optionIds.has(id)) {
        throw new Error(`Question ${i + 1}: correct "${id}" not in options`);
      }
    }
    const qId = `${moduleId}-q-${i + 1}`;
    await sql`
      INSERT INTO course_mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation)
      VALUES (
        ${qId},
        ${moduleId},
        0,
        ${String(q.prompt).trim()},
        ${correctStored},
        ${q.explanation ? String(q.explanation).trim() : null}
      )
    `;
    for (const opt of q.options) {
      await sql`
        INSERT INTO course_mcq_options (id, question_id, label)
        VALUES (
          ${String(opt.id).trim().toLowerCase()},
          ${qId},
          ${String(opt.label).trim()}
        )
      `;
    }
    imported++;
  }

  await upsertStep(moduleId, "quiz", { questionCount: imported });
  return imported;
}

async function ensureModule(reuseId) {
  if (reuseId) {
    const rows = await sql`SELECT id, title FROM course_modules WHERE id = ${reuseId} LIMIT 1`;
    if (!rows.length) throw new Error(`Module not found: ${reuseId}`);
    console.log(`Reusing module ${rows[0].id} (${rows[0].title})`);
    return rows[0].id;
  }

  const existing = await sql`
    SELECT id, title FROM course_modules
    WHERE lower(title) = lower(${TITLE})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (existing.length) {
    console.log(`Found existing module ${existing[0].id} — refreshing assets/steps`);
    await sql`
      UPDATE course_modules
      SET description = ${DESCRIPTION},
          duration_minutes = ${DURATION_MINUTES},
          content_type = 'text',
          slide_count = 1,
          updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    return existing[0].id;
  }

  const id = `course-${slugify(TITLE)}-${Date.now()}`;
  await sql`
    INSERT INTO course_modules (
      id, title, description, slide_count, duration_minutes,
      content_type, feedback_required, mcq_generation_status
    )
    VALUES (
      ${id},
      ${TITLE},
      ${DESCRIPTION},
      1,
      ${DURATION_MINUTES},
      'text',
      false,
      'pending'
    )
  `;
  console.log(`Created module ${id}`);
  return id;
}

async function mirrorAiBasicsBatches(moduleId) {
  const basics = await sql`
    SELECT batch_id FROM course_module_batches
    WHERE module_id = 'course-ai-basics-1783575957097'
  `;
  if (!basics.length) {
    console.log("  batches → AI Basics has none; skipping assignment");
    return 0;
  }
  let n = 0;
  for (const row of basics) {
    await sql`
      INSERT INTO course_module_batches (module_id, batch_id)
      VALUES (${moduleId}, ${row.batch_id})
      ON CONFLICT DO NOTHING
    `;
    n++;
  }
  console.log(`  batches → mirrored ${n} from AI Basics`);
  return n;
}

try {
  console.log("\n=== Seed Responsible AI & Ethics ===\n");

  requireFile(LESSON_SRC, "lesson HTML");
  requireFile(SCENARIOS_SRC, "scenarios HTML");
  requireFile(MINDMAP_SRC, "mindmap HTML");
  requireFile(INFOGRAPHIC_SRC, "infographic PNG");
  requireFile(QUIZ_SRC, "quiz JSON");
  const videoPath = resolveVideo();

  const moduleId = await ensureModule(args.reuse);

  console.log("\nUploading media…");
  const lessonHtml = fs.readFileSync(LESSON_SRC, "utf8");
  const lessonSlides = (lessonHtml.match(/<section\s+class="slide/gi) || []).length || 20;
  const lesson = await storeMediaAsset({
    srcPath: LESSON_SRC,
    originalName: "relanto_responsible_ai_ethics_interactive.html",
    mimeType: "text/html",
    ext: ".html",
  });
  await upsertStep(moduleId, "pdf", {
    assetUrl: lesson.assetUrl,
    originalName: lesson.originalName,
    mimeType: lesson.mimeType,
    pageCount: lessonSlides,
  });

  const scenarios = await storeMediaAsset({
    srcPath: SCENARIOS_SRC,
    originalName: "relanto_responsible_ai_scenarios_interactive.html",
    mimeType: "text/html",
    ext: ".html",
  });
  await upsertStep(moduleId, "scenarios", {
    assetUrl: scenarios.assetUrl,
    originalName: scenarios.originalName,
    mimeType: scenarios.mimeType,
    pageCount: 7,
  });

  const video = await storeMediaAsset({
    srcPath: videoPath,
    originalName: "Responsible_AI_Ethics.mp4",
    mimeType: "video/mp4",
    ext: ".mp4",
  });
  await upsertStep(moduleId, "video", {
    assetUrl: video.assetUrl,
    originalName: video.originalName,
    mimeType: video.mimeType,
  });

  const mindmap = await storeMediaAsset({
    srcPath: MINDMAP_SRC,
    originalName: "mindmap-responsible-ai-ethics.html",
    mimeType: "text/html",
    ext: ".html",
  });
  await upsertStep(moduleId, "mindmap", {
    assetUrl: mindmap.assetUrl,
    originalName: mindmap.originalName,
    mimeType: mindmap.mimeType,
  });

  const infographic = await storeMediaAsset({
    srcPath: INFOGRAPHIC_SRC,
    originalName: "Responsible_AI_How_to_Own_Your_Outcomes.png",
    mimeType: "image/png",
    ext: ".png",
  });
  await upsertStep(moduleId, "infographic", {
    assetUrl: infographic.assetUrl,
    originalName: infographic.originalName,
    mimeType: infographic.mimeType,
  });

  console.log("\nImporting quiz…");
  const quizRaw = JSON.parse(fs.readFileSync(QUIZ_SRC, "utf8"));
  const questions = Array.isArray(quizRaw) ? quizRaw : quizRaw.questions;
  if (!Array.isArray(questions) || questions.length < 1) {
    throw new Error("Quiz JSON has no questions");
  }
  const imported = await importQuiz(moduleId, questions);
  console.log(`  ✅ imported ${imported} questions`);

  await sql`
    UPDATE course_modules
    SET mcq_generation_status = 'completed',
        duration_minutes = ${DURATION_MINUTES},
        updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  if (!args.noBatches) {
    console.log("\nAssigning batches…");
    await mirrorAiBasicsBatches(moduleId);
  } else {
    console.log("\nSkipping batch assignment (--no-batches)");
  }

  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM course_module_steps
    WHERE module_id = ${moduleId}
    ORDER BY step_order
  `;
  const qCount = await sql`
    SELECT COUNT(*)::int AS c FROM course_mcq_questions WHERE module_id = ${moduleId}
  `;
  const assetsOk = [];
  for (const step of steps) {
    const cfg =
      typeof step.config === "string" ? JSON.parse(step.config) : step.config || {};
    if (step.step_type === "quiz") {
      assetsOk.push(`${step.step_order}:${step.step_type}=q${qCount[0].c}`);
      continue;
    }
    const filename = String(cfg.assetUrl || "").replace("/course-assets/", "");
    const rows = await sql`
      SELECT size_bytes FROM course_assets WHERE filename = ${filename} LIMIT 1
    `;
    const disk = fs.existsSync(path.join(ASSETS_DIR, filename));
    assetsOk.push(
      `${step.step_order}:${step.step_type}=neon:${rows[0]?.size_bytes ?? 0}/disk:${disk}`,
    );
  }

  console.log("\n=== Bundle ready ===");
  console.log(`moduleId : ${moduleId}`);
  console.log(`title    : ${TITLE}`);
  console.log(`questions: ${qCount[0].c}`);
  console.log(`steps    :`);
  for (const line of assetsOk) console.log(`  - ${line}`);
  console.log("\nLearner URL path: /employee (assign via batches if needed)");
} catch (err) {
  console.error("\n❌ Seed failed:", err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

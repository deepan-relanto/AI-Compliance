import { getCourseAssetBuffer } from "@/lib/services/course-asset-service";
import { extractJsonObject, geminiChatJson } from "@/lib/services/gemini-llm";
import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;
const MAX_RAW_TEXT_CHARS = 1400;
const BEATS_PER_BATCH = 5;
const MAX_CONTEXT_BODY_CHARS = 3200;

export type TtsCourseSettings = {
  ttsEnabled: boolean;
  avatarEnabled: boolean;
  scriptStatus: "not_started" | "generating" | "generated" | "reviewed" | "failed";
};

export type TtsScriptSegment = {
  id: string;
  sourceStepType: string;
  stepOrder: number;
  beatKey: string;
  slideIndex: number;
  fragmentIndex: number;
  slideTitle: string | null;
  rawText: string;
  scriptText: string;
};

type BeatDraft = Omit<TtsScriptSegment, "id" | "scriptText">;

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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, max = MAX_RAW_TEXT_CHARS): string {
  const normalized = normalizeText(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

function parseScriptResponse(
  response: string,
): {
  scripts?: { beatKey?: string; script?: string }[];
} {
  const jsonText = extractJsonObject(response);
  try {
    return JSON.parse(jsonText) as {
      scripts?: { beatKey?: string; script?: string }[];
    };
  } catch {
    const scripts: { beatKey?: string; script?: string }[] = [];
    const pattern = /"beatKey"\s*:\s*"([^"]+)"[\s\S]*?"script"\s*:\s*"([\s\S]*?)"/g;
    for (const match of jsonText.matchAll(pattern)) {
      scripts.push({
        beatKey: match[1],
        script: normalizeText(
          match[2]
            .replace(/\\"/g, "\"")
            .replace(/\\n/g, " ")
            .replace(/\\r/g, " "),
        ),
      });
    }
    if (scripts.length > 0) {
      return { scripts };
    }
    throw new Error("Could not parse Gemini JSON response.");
  }
}

function extractTitle(slideHtml: string, fallback: string | null): string | null {
  const attr = slideHtml.match(/data-title="([^"]+)"/i)?.[1]?.trim();
  if (attr) return attr;
  const heading = slideHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
  const clean = heading ? stripHtml(heading) : "";
  return clean || fallback;
}

function extractBeatDraftsFromHtml(
  html: string,
  stepType: string,
  stepOrder: number,
): BeatDraft[] {
  const slides = [...html.matchAll(/<section[^>]*class="[^"]*\bslide\b[^"]*"[^>]*>([\s\S]*?)<\/section>/gi)];
  if (slides.length === 0) return [];

  const drafts: BeatDraft[] = [];
  slides.forEach((match, slideIndex) => {
    const slideHtml = match[0];
    const bodyHtml = match[1] ?? "";
    const slideTitle = extractTitle(slideHtml, `Slide ${slideIndex + 1}`);
    const slideText = truncateText(stripHtml(bodyHtml));
    drafts.push({
      sourceStepType: stepType,
      stepOrder,
      beatKey: `${stepType}:${stepOrder}:${slideIndex}:0`,
      slideIndex,
      fragmentIndex: 0,
      slideTitle,
      rawText: slideText,
    });

    const fragments = [...slideHtml.matchAll(/<[^>]*class="[^"]*\bfragment\b[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)];
    fragments.forEach((fragment, fragmentIndex) => {
      const fragmentText = truncateText(stripHtml(fragment[1] ?? ""), 500);
      if (!fragmentText) return;
      drafts.push({
        sourceStepType: stepType,
        stepOrder,
        beatKey: `${stepType}:${stepOrder}:${slideIndex}:${fragmentIndex + 1}`,
        slideIndex,
        fragmentIndex: fragmentIndex + 1,
        slideTitle,
        rawText: `${slideTitle ?? `Slide ${slideIndex + 1}`}: ${fragmentText}`,
      });
    });
  });

  return drafts.filter((draft) => draft.rawText.trim().length > 0);
}

function extractDocumentContext(html: string) {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    html.match(/data-title="([^"]+)"/i)?.[1] ??
    "";
  const metaDescription =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => normalizeText(stripHtml(m[1] ?? "")))
    .filter(Boolean)
    .slice(0, 20);
  const paragraphs = stripHtml(html)
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 20)
    .slice(0, 40);
  const bodyText = truncateText(paragraphs.join(" "), MAX_CONTEXT_BODY_CHARS);
  return {
    documentTitle: normalizeText(stripHtml(title)),
    metaDescription: normalizeText(stripHtml(metaDescription)),
    headings,
    paragraphs,
    bodyText,
  };
}

export async function ensureTtsSandboxCourse(sql: Sql, sourceModuleId: string) {
  const sandboxId = `tts-${sourceModuleId}`;

  // Prefer the canonical sandbox id so empty duplicates don't shadow live courses.
  const byCanonical = await sql`
    SELECT id, source_module_id, title, description, tts_enabled, avatar_enabled, script_status
    FROM tts_course_modules
    WHERE id = ${sandboxId}
    LIMIT 1
  `;
  let existing = byCanonical;

  if (existing.length === 0) {
    existing = await sql`
      SELECT id, source_module_id, title, description, tts_enabled, avatar_enabled, script_status
      FROM tts_course_modules
      WHERE source_module_id = ${sourceModuleId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
  }

  const modules = await sql`
    SELECT id, title, description, slide_count, duration_minutes, content_type, pdf_url,
           feedback_required, status_default, content_hash, mcq_generation_status
    FROM course_modules
    WHERE id = ${sourceModuleId}
    LIMIT 1
  `;
  if (modules.length === 0) {
    throw new Error("Source course not found.");
  }
  const source = modules[0];

  // Drop non-canonical duplicates that steal source_module_id lookups.
  await sql`
    DELETE FROM tts_course_modules
    WHERE source_module_id = ${sourceModuleId}
      AND id <> ${sandboxId}
  `;

  await sql`
    INSERT INTO tts_course_modules (
      id, source_module_id, title, description, slide_count, duration_minutes, content_type,
      pdf_url, feedback_required, status_default, content_hash, mcq_generation_status,
      tts_enabled, avatar_enabled, script_status
    )
    VALUES (
      ${sandboxId},
      ${sourceModuleId},
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
      ${existing[0] ? String(existing[0].script_status ?? "not_started") : "not_started"}
    )
    ON CONFLICT (id) DO UPDATE SET
      source_module_id = EXCLUDED.source_module_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      slide_count = EXCLUDED.slide_count,
      duration_minutes = EXCLUDED.duration_minutes,
      content_type = EXCLUDED.content_type,
      pdf_url = EXCLUDED.pdf_url,
      feedback_required = EXCLUDED.feedback_required,
      status_default = EXCLUDED.status_default,
      content_hash = EXCLUDED.content_hash,
      mcq_generation_status = EXCLUDED.mcq_generation_status,
      tts_enabled = true,
      avatar_enabled = true,
      updated_at = NOW()
  `;

  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM course_module_steps
    WHERE module_id = ${sourceModuleId}
    ORDER BY step_order
  `;

  let retries = 3;
  while (retries > 0) {
    try {
      await sql`
        DELETE FROM tts_course_module_steps
        WHERE module_id = ${sandboxId}
      `;

      for (const step of steps) {
        await sql`
          INSERT INTO tts_course_module_steps (module_id, step_order, step_type, title, config)
          VALUES (
            ${sandboxId},
            ${Number(step.step_order)},
            ${String(step.step_type)},
            ${String(step.title)},
            ${step.config}
          )
        `;
      }
      break;
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  const sandboxRows = await sql`
    SELECT id, source_module_id, title, description, tts_enabled, avatar_enabled, script_status
    FROM tts_course_modules
    WHERE id = ${sandboxId}
    LIMIT 1
  `;
  return sandboxRows[0];
}

export async function getTtsSandboxCourse(sql: Sql, sourceModuleId: string) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  await syncDraftSegments(sql, String(sandbox.id));
  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM tts_course_module_steps
    WHERE module_id = ${String(sandbox.id)}
    ORDER BY step_order
  `;
  const segments = await sql`
    SELECT id, source_step_type, step_order, beat_key, slide_index, fragment_index,
           slide_title, raw_text, script_text
    FROM tts_course_script_segments
    WHERE module_id = ${String(sandbox.id)}
    ORDER BY step_order, slide_index, fragment_index
  `;
  return {
    sandboxId: String(sandbox.id),
    title: String(sandbox.title),
    description: String(sandbox.description ?? ""),
    settings: {
      ttsEnabled: Boolean(sandbox.tts_enabled),
      avatarEnabled: Boolean(sandbox.avatar_enabled),
      scriptStatus: String(sandbox.script_status ?? "not_started") as TtsCourseSettings["scriptStatus"],
    },
    steps: steps.map((step) => ({
      stepOrder: Number(step.step_order),
      stepType: String(step.step_type),
      title: String(step.title),
      config: step.config as Record<string, unknown>,
    })),
    segments: segments.map((segment) => ({
      id: String(segment.id),
      sourceStepType: String(segment.source_step_type),
      stepOrder: Number(segment.step_order),
      beatKey: String(segment.beat_key),
      slideIndex: Number(segment.slide_index),
      fragmentIndex: Number(segment.fragment_index),
      slideTitle: segment.slide_title ? String(segment.slide_title) : null,
      rawText: String(segment.raw_text ?? ""),
      scriptText: String(segment.script_text ?? ""),
    })),
  };
}

async function collectDraftSegmentsForSandbox(sql: Sql, sandboxId: string): Promise<BeatDraft[]> {
  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM tts_course_module_steps
    WHERE module_id = ${String(sandboxId)}
      AND step_type IN ('pdf', 'scenarios', 'mindmap')
    ORDER BY step_order
  `;

  const drafts: BeatDraft[] = [];
  for (const step of steps) {
    const config = step.config as { assetUrl?: string | null; mimeType?: string | null };
    const assetUrl = config?.assetUrl;
    if (!assetUrl) continue;
    const { buffer, mimeType } = await getCourseAssetBuffer(String(assetUrl));
    const isHtml =
      String(mimeType ?? "").toLowerCase().includes("html") ||
      String(assetUrl).toLowerCase().endsWith(".html");
    if (!isHtml) continue;
    const html = buffer.toString("utf8");
    drafts.push(
      ...extractBeatDraftsFromHtml(html, String(step.step_type), Number(step.step_order)).map((draft) => ({
        ...draft,
        rawText: truncateText(draft.rawText),
      })),
    );
  }

  return drafts;
}

async function syncDraftSegments(sql: Sql, sandboxId: string) {
  const drafts = await collectDraftSegmentsForSandbox(sql, sandboxId);
  for (const draft of drafts) {
    await sql`
      INSERT INTO tts_course_script_segments (
        module_id, source_step_type, step_order, beat_key, slide_index,
        fragment_index, slide_title, raw_text, script_text
      )
      VALUES (
        ${sandboxId},
        ${draft.sourceStepType},
        ${draft.stepOrder},
        ${draft.beatKey},
        ${draft.slideIndex},
        ${draft.fragmentIndex},
        ${draft.slideTitle},
        ${draft.rawText},
        COALESCE(${""}, '')
      )
      ON CONFLICT (module_id, beat_key) DO UPDATE SET
        source_step_type = EXCLUDED.source_step_type,
        step_order = EXCLUDED.step_order,
        slide_index = EXCLUDED.slide_index,
        fragment_index = EXCLUDED.fragment_index,
        slide_title = EXCLUDED.slide_title,
        raw_text = EXCLUDED.raw_text,
        updated_at = NOW()
    `;
  }
  return drafts;
}

export async function updateTtsSandboxSettings(
  sql: Sql,
  sourceModuleId: string,
  input: Partial<{ ttsEnabled: boolean; avatarEnabled: boolean; scriptStatus: TtsCourseSettings["scriptStatus"] }>,
) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  const nextTts =
    typeof input.ttsEnabled === "boolean"
      ? input.ttsEnabled
      : Boolean(sandbox.tts_enabled);
  const nextAvatar =
    typeof input.avatarEnabled === "boolean"
      ? input.avatarEnabled
      : input.ttsEnabled === false
        ? false
        : Boolean(sandbox.avatar_enabled);
  await sql`
    UPDATE tts_course_modules
    SET tts_enabled = ${nextTts},
        avatar_enabled = ${nextAvatar},
        script_status = ${input.scriptStatus ?? String(sandbox.script_status ?? "not_started")},
        updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;
  return getTtsSandboxCourse(sql, sourceModuleId);
}

async function generateNarrationScriptsBatch(
  drafts: BeatDraft[],
  courseTitle: string,
  courseDescription: string,
  context: { documentTitle: string; metaDescription: string; headings: string[]; paragraphs: string[]; bodyText: string },
) {
  const system = [
    "You write narration scripts for corporate learning slides.",
    "Return valid JSON with a single key named scripts.",
    "scripts must be an array of objects with beatKey and script.",
    "Keep each script concise, spoken, professional, and easy to follow.",
    "Do not mention UI controls, buttons, or slide numbers.",
    "Use 1 short paragraph per script only.",
  ].join(" ");

  const user = JSON.stringify({
    courseTitle,
    courseDescription,
    htmlContext: context,
    beats: drafts.map((draft) => ({
      beatKey: draft.beatKey,
      stepType: draft.sourceStepType,
      stepOrder: draft.stepOrder,
      slideTitle: draft.slideTitle,
      slideIndex: draft.slideIndex,
      fragmentIndex: draft.fragmentIndex,
      rawText: truncateText(draft.rawText),
    })),
    instruction: "Transform each beat into a short voiceover script for a talking avatar. Keep each script under 90 words.",
  });

  const response = await geminiChatJson(system, user, {
    maxTokens: 1400,
    temperature: 0.3,
    timeoutMs: 90_000,
  });

  const parsed = parseScriptResponse(response);
  const map = new Map<string, string>();
  for (const draft of drafts) {
    map.set(draft.beatKey, draft.rawText);
  }
  for (const item of parsed.scripts ?? []) {
    if (!item?.beatKey || !item.script) continue;
    map.set(String(item.beatKey), normalizeText(String(item.script)));
  }
  return map;
}

function buildSingleBeatContext(
  context: { documentTitle: string; metaDescription: string; headings: string[]; paragraphs: string[]; bodyText: string },
  draft: BeatDraft,
) {
  return {
    documentTitle: context.documentTitle,
    metaDescription: context.metaDescription,
    headings: context.headings.slice(0, 6),
    paragraphs: context.paragraphs
      .filter((paragraph) => {
        const text = draft.rawText.toLowerCase();
        return paragraph.toLowerCase().includes(text.slice(0, 40)) || text.includes(paragraph.toLowerCase().slice(0, 40));
      })
      .slice(0, 4),
    bodyText: truncateText(draft.rawText, 700),
  };
}

async function generateNarrationScriptsWithRetry(
  drafts: BeatDraft[],
  courseTitle: string,
  courseDescription: string,
  context: { documentTitle: string; metaDescription: string; headings: string[]; paragraphs: string[]; bodyText: string },
) {
  try {
    return await generateNarrationScriptsBatch(drafts, courseTitle, courseDescription, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = /timed out|timeout|504|503|502/i.test(message);
    if (!retryable || drafts.length === 1) {
      throw error;
    }

    const lighterContext = {
      ...context,
      headings: context.headings.slice(0, 8),
      paragraphs: context.paragraphs.slice(0, 12),
      bodyText: truncateText(context.bodyText, 1600),
    };

    const midpoint = Math.ceil(drafts.length / 2);
    const left = await generateNarrationScriptsBatch(
      drafts.slice(0, midpoint),
      courseTitle,
      courseDescription,
      lighterContext,
    );
    const right = await generateNarrationScriptsBatch(
      drafts.slice(midpoint),
      courseTitle,
      courseDescription,
      lighterContext,
    );
    return new Map<string, string>([...left.entries(), ...right.entries()]);
  }
}

export async function generateTtsScriptsForCourse(sql: Sql, sourceModuleId: string) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  await sql`
    UPDATE tts_course_modules
    SET script_status = 'generating', updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;
  await sql`
    DELETE FROM tts_course_script_segments
    WHERE module_id = ${String(sandbox.id)}
  `;

  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM tts_course_module_steps
    WHERE module_id = ${String(sandbox.id)}
      AND step_type IN ('pdf', 'scenarios', 'mindmap')
    ORDER BY step_order
  `;

  const allDrafts: BeatDraft[] = [];
  for (const step of steps) {
    const config = step.config as { assetUrl?: string | null; mimeType?: string | null };
    const assetUrl = config?.assetUrl;
    if (!assetUrl) continue;
    const { buffer, mimeType } = await getCourseAssetBuffer(String(assetUrl));
    const isHtml = String(mimeType ?? "").toLowerCase().includes("html") || String(assetUrl).toLowerCase().endsWith(".html");
    if (!isHtml) continue;
    const html = buffer.toString("utf8");
    const drafts = extractBeatDraftsFromHtml(html, String(step.step_type), Number(step.step_order));
    const context = extractDocumentContext(html);
    drafts.forEach((draft) => {
      allDrafts.push({
        ...draft,
        rawText: truncateText(draft.rawText),
      });
    });
    const stepDrafts = drafts.filter((draft) => draft.rawText.trim().length > 0);
    for (let i = 0; i < stepDrafts.length; i += BEATS_PER_BATCH) {
      const chunk = stepDrafts.slice(i, i + BEATS_PER_BATCH);
      const resilientScripts = await generateNarrationScriptsWithRetry(
        chunk,
        String(sandbox.title),
        String(sandbox.description ?? ""),
        context,
      );
      for (const draft of chunk) {
        await sql`
          INSERT INTO tts_course_script_segments (
            module_id, source_step_type, step_order, beat_key, slide_index,
            fragment_index, slide_title, raw_text, script_text
          )
          VALUES (
            ${String(sandbox.id)},
            ${draft.sourceStepType},
            ${draft.stepOrder},
            ${draft.beatKey},
            ${draft.slideIndex},
            ${draft.fragmentIndex},
            ${draft.slideTitle},
            ${draft.rawText},
            ${resilientScripts.get(draft.beatKey) ?? draft.rawText}
          )
        `;
      }
    }
  }

  const uniqueDrafts = allDrafts.filter(
    (draft, index, arr) => arr.findIndex((item) => item.beatKey === draft.beatKey) === index,
  );

  if (uniqueDrafts.length === 0) {
    await sql`
      UPDATE tts_course_modules
      SET script_status = 'failed', updated_at = NOW()
      WHERE id = ${String(sandbox.id)}
    `;
    throw new Error("No HTML slides were found to generate TTS scripts from.");
  }

  await sql`
    UPDATE tts_course_modules
    SET script_status = 'generated', updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;

  return getTtsSandboxCourse(sql, sourceModuleId);
}

export async function generateTtsScriptSegment(
  sql: Sql,
  sourceModuleId: string,
  segmentId: string,
) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  await syncDraftSegments(sql, String(sandbox.id));

  const segments = await sql`
    SELECT id, source_step_type, step_order, beat_key, slide_index, fragment_index,
           slide_title, raw_text, script_text
    FROM tts_course_script_segments
    WHERE id = ${segmentId}
      AND module_id = ${String(sandbox.id)}
    LIMIT 1
  `;
  if (segments.length === 0) {
    throw new Error("TTS beat not found.");
  }

  const segment = segments[0];
  const stepOrder = Number(segment.step_order);
  const stepType = String(segment.source_step_type);
  const steps = await sql`
    SELECT config
    FROM tts_course_module_steps
    WHERE module_id = ${String(sandbox.id)}
      AND step_order = ${stepOrder}
      AND step_type = ${stepType}
    LIMIT 1
  `;
  if (steps.length === 0) {
    throw new Error("Source HTML step not found for this beat.");
  }

  const config = steps[0].config as { assetUrl?: string | null; mimeType?: string | null };
  const assetUrl = config?.assetUrl;
  if (!assetUrl) {
    throw new Error("No HTML asset is configured for this beat.");
  }

  const { buffer, mimeType } = await getCourseAssetBuffer(String(assetUrl));
  const isHtml =
    String(mimeType ?? "").toLowerCase().includes("html") ||
    String(assetUrl).toLowerCase().endsWith(".html");
  if (!isHtml) {
    throw new Error("The selected beat is not backed by an HTML asset.");
  }

  const html = buffer.toString("utf8");
  const context = extractDocumentContext(html);
  const allDrafts = extractBeatDraftsFromHtml(html, stepType, stepOrder).map((draft) => ({
    ...draft,
    rawText: truncateText(draft.rawText),
  }));
  const targetDraft = allDrafts.find((draft) => draft.beatKey === String(segment.beat_key));
  if (!targetDraft) {
    throw new Error("Could not rebuild the selected beat from the HTML source.");
  }

  await sql`
    UPDATE tts_course_modules
    SET script_status = 'generating', updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;

  const generatedScripts = await generateNarrationScriptsWithRetry(
    [targetDraft],
    String(sandbox.title),
    String(sandbox.description ?? ""),
    buildSingleBeatContext(context, targetDraft),
  );

  await sql`
    UPDATE tts_course_script_segments
    SET raw_text = ${targetDraft.rawText},
        script_text = ${generatedScripts.get(targetDraft.beatKey) ?? targetDraft.rawText},
        updated_at = NOW()
    WHERE id = ${segmentId}
      AND module_id = ${String(sandbox.id)}
  `;
  await sql`
    UPDATE tts_course_modules
    SET script_status = 'generated', updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;

  return getTtsSandboxCourse(sql, sourceModuleId);
}

export async function updateTtsScriptSegment(
  sql: Sql,
  sourceModuleId: string,
  segmentId: string,
  scriptText: string,
) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  await sql`
    UPDATE tts_course_script_segments
    SET script_text = ${scriptText.trim()},
        updated_at = NOW()
    WHERE id = ${segmentId}
      AND module_id = ${String(sandbox.id)}
  `;
  await sql`
    UPDATE tts_course_modules
    SET script_status = 'reviewed', updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;
  return getTtsSandboxCourse(sql, sourceModuleId);
}

/** Read-only learner playback — does not create a sandbox. */
export async function getTtsPlaybackForLearner(sql: Sql, sourceModuleId: string) {
  const sandboxId = `tts-${sourceModuleId}`;
  const sandboxRows = await sql`
    SELECT id, source_module_id, title, tts_enabled, avatar_enabled, script_status
    FROM tts_course_modules
    WHERE id = ${sandboxId}
       OR source_module_id = ${sourceModuleId}
    ORDER BY CASE WHEN id = ${sandboxId} THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `;
  if (sandboxRows.length === 0) {
    return null;
  }
  const sandbox = sandboxRows[0];
  const ttsEnabled = Boolean(sandbox.tts_enabled);
  const avatarEnabled = Boolean(sandbox.avatar_enabled);
  if (!ttsEnabled && !avatarEnabled) {
    return null;
  }

  const segments = await sql`
    SELECT id, source_step_type, step_order, beat_key, slide_index, fragment_index,
           slide_title, raw_text, script_text
    FROM tts_course_script_segments
    WHERE module_id = ${String(sandbox.id)}
    ORDER BY step_order, slide_index, fragment_index
  `;

  return {
    sandboxId: String(sandbox.id),
    settings: {
      ttsEnabled,
      avatarEnabled,
      scriptStatus: String(sandbox.script_status ?? "not_started") as TtsCourseSettings["scriptStatus"],
    },
    segments: segments.map((segment) => ({
      id: String(segment.id),
      sourceStepType: String(segment.source_step_type),
      stepOrder: Number(segment.step_order),
      beatKey: String(segment.beat_key),
      slideIndex: Number(segment.slide_index),
      fragmentIndex: Number(segment.fragment_index),
      slideTitle: segment.slide_title ? String(segment.slide_title) : null,
      rawText: String(segment.raw_text ?? ""),
      scriptText: String(segment.script_text ?? ""),
    })),
  };
}

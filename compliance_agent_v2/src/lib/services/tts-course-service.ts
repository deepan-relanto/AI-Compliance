import { getCourseAssetBuffer } from "@/lib/services/course-asset-service";
import { nvidiaChatJson } from "@/lib/services/nvidia-llm";
import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

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
    const slideText = stripHtml(bodyHtml);
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
      const fragmentText = stripHtml(fragment[1] ?? "");
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

export async function ensureTtsSandboxCourse(sql: Sql, sourceModuleId: string) {
  const existing = await sql`
    SELECT id, source_module_id, title, description, tts_enabled, avatar_enabled, script_status
    FROM tts_course_modules
    WHERE source_module_id = ${sourceModuleId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (existing.length > 0) {
    return existing[0];
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
  const sandboxId = `tts-${sourceModuleId}`;

  await sql`
    INSERT INTO tts_course_modules (
      id, source_module_id, title, description, slide_count, duration_minutes, content_type,
      pdf_url, feedback_required, status_default, content_hash, mcq_generation_status
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
      ${String(source.mcq_generation_status ?? "completed")}
    )
  `;

  const steps = await sql`
    SELECT step_order, step_type, title, config
    FROM course_module_steps
    WHERE module_id = ${sourceModuleId}
    ORDER BY step_order
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
      ON CONFLICT (module_id, step_type) DO UPDATE SET
        step_order = EXCLUDED.step_order,
        title = EXCLUDED.title,
        config = EXCLUDED.config,
        updated_at = NOW()
    `;
  }

  return {
    id: sandboxId,
    source_module_id: sourceModuleId,
    title: source.title,
    description: source.description,
    tts_enabled: false,
    avatar_enabled: false,
    script_status: "not_started",
  };
}

export async function getTtsSandboxCourse(sql: Sql, sourceModuleId: string) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
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

export async function updateTtsSandboxSettings(
  sql: Sql,
  sourceModuleId: string,
  input: Partial<{ ttsEnabled: boolean; avatarEnabled: boolean; scriptStatus: TtsCourseSettings["scriptStatus"] }>,
) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  const nextTts = input.ttsEnabled ?? Boolean(sandbox.tts_enabled);
  const nextAvatar = input.avatarEnabled ?? Boolean(sandbox.avatar_enabled);
  await sql`
    UPDATE tts_course_modules
    SET tts_enabled = ${nextTts},
        avatar_enabled = ${nextAvatar && nextTts},
        script_status = ${input.scriptStatus ?? String(sandbox.script_status ?? "not_started")},
        updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
  `;
  return getTtsSandboxCourse(sql, sourceModuleId);
}

async function generateNarrationScript(draft: BeatDraft, courseTitle: string, courseDescription: string) {
  const system = [
    "You write narration scripts for corporate learning slides.",
    "Return valid JSON with a single key named script.",
    "Keep the script concise, spoken, professional, and easy to follow.",
    "Do not mention UI controls, buttons, or slide numbers.",
    "Use 1 short paragraph only.",
  ].join(" ");

  const user = JSON.stringify({
    courseTitle,
    courseDescription,
    stepType: draft.sourceStepType,
    stepOrder: draft.stepOrder,
    slideTitle: draft.slideTitle,
    rawText: draft.rawText,
    instruction:
      "Transform the slide content into a short voiceover script for a talking avatar. Keep it under 90 words.",
  });

  const response = await nvidiaChatJson(system, user, {
    maxTokens: 300,
    temperature: 0.3,
    timeoutMs: 60_000,
  });

  const parsed = JSON.parse(response) as { script?: string };
  return parsed.script?.trim() || draft.rawText;
}

export async function generateTtsScriptsForCourse(sql: Sql, sourceModuleId: string) {
  const sandbox = await ensureTtsSandboxCourse(sql, sourceModuleId);
  await sql`
    UPDATE tts_course_modules
    SET script_status = 'generating', updated_at = NOW()
    WHERE id = ${String(sandbox.id)}
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
    allDrafts.push(...drafts);
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
    DELETE FROM tts_course_script_segments
    WHERE module_id = ${String(sandbox.id)}
  `;

  for (const draft of uniqueDrafts) {
    const scriptText = await generateNarrationScript(
      draft,
      String(sandbox.title),
      String(sandbox.description ?? ""),
    );
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
        ${scriptText}
      )
    `;
  }

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

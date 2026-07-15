import { createHash } from "crypto";
import { normalizeMcqExplanation } from "@/lib/mcq-explanation";
import { MCQ_SYSTEM_PROMPT, buildMcqUserPrompt } from "@/lib/prompts/mcq-checkpoint";
import { extractPdfPagesText } from "@/lib/services/pdf-text-service";
import { geminiChatJson } from "@/lib/services/gemini-llm";
import {
  gateCountForSlides,
  normalizeMcqPrompt,
} from "@/lib/mcq-dedupe";
import { shuffleAndRemapMcqOptions } from "@/lib/mcq-options-shuffle";
import {
  buildRelantoScenarioPrompt,
  isAcceptableMcqPrompt,
} from "@/lib/mcq-quality";

const MIN_POOL_SIZE = 10;

export interface GeneratedMcq {
  id: string;
  slideIndex: number;
  prompt: string;
  correctOptionId: string;
  explanation: string;
  options: { id: string; label: string }[];
}

interface LlmMcqPayload {
  questions?: Array<{
    prompt?: string;
    options?: { id: string; label: string }[];
    correctOptionId?: string;
    explanation?: string;
  }>;
}

interface SingleLlmPayload {
  prompt?: string;
  options?: { id: string; label: string }[];
  correctOptionId?: string;
  explanation?: string;
}

export async function hashPdfFile(pdfUrl: string): Promise<string> {
  const { getPdfBuffer } = await import("@/lib/services/pdf-storage-service");
  const buf = await getPdfBuffer(pdfUrl);
  return createHash("sha256").update(buf).digest("hex");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = raw.slice(start, end + 1);
      try {
        return JSON.parse(sliced) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

const JUNK_TEXT_PATTERN =
  /copyright|©|\ball rights reserved\b|\bconfidential\b|\bpage\s+\d+\b|\brelanto inc\b|\bunauthorized reproduction\b/i;

function isUsablePassage(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 80 || cleaned.length > 420) return false;
  if (JUNK_TEXT_PATTERN.test(cleaned)) return false;
  if (/^[\d\s\-–—.]+$/.test(cleaned)) return false;
  const words = cleaned.split(/\s+/);
  if (words.length < 12) return false;
  return true;
}

function extractContentPassages(fullText: string, pages: string[]): string[] {
  const passages: string[] = [];

  const pageSlice =
    pages.length > 2 ? pages.slice(1, -1) : pages.length > 0 ? pages : [];

  for (const page of pageSlice) {
    for (const paragraph of page.split(/\n{2,}/)) {
      const cleaned = paragraph.replace(/\s+/g, " ").trim();
      if (isUsablePassage(cleaned)) passages.push(cleaned);
    }
  }

  if (passages.length === 0) {
    for (const sentence of fullText.split(/(?<=[.!?])\s+/)) {
      const cleaned = sentence.replace(/\s+/g, " ").trim();
      if (isUsablePassage(cleaned)) passages.push(cleaned);
    }
  }

  return passages;
}

const RELANTO_FALLBACK_ANSWERS: Array<{
  correctOptionId: "a" | "b" | "c" | "d";
  explanation: string;
  options: { id: "a" | "b" | "c" | "d"; label: string }[];
}> = [
  {
    correctOptionId: "b",
    explanation:
      "Approved VPN or secure access is required on untrusted networks before touching client systems. HTTPS alone does not protect the full session on public Wi‑Fi.",
    options: [
      { id: "a", label: "Proceed because the client portal uses HTTPS." },
      { id: "b", label: "Connect through the approved VPN, then access client systems." },
      { id: "c", label: "Disable security tools to improve connection speed." },
      { id: "d", label: "Ask a teammate to log in remotely on their behalf." },
    ],
  },
  {
    correctOptionId: "c",
    explanation:
      "Unapproved software and unknown USB content can introduce malware on client devices. IT and client approval gates exist before any install.",
    options: [
      { id: "a", label: "Install the utility since the vendor is on site." },
      { id: "b", label: "Copy files to a personal drive for scanning at home." },
      { id: "c", label: "Decline the install and follow the approved software/USB process." },
      { id: "d", label: "Let the client admin install it without informing Relanto IT." },
    ],
  },
  {
    correctOptionId: "a",
    explanation:
      "Client data must remain on approved systems with monitoring and retention controls. Personal cloud storage bypasses those protections.",
    options: [
      { id: "a", label: "Keep files on approved client/company systems and request formal approval for any exception." },
      { id: "b", label: "Upload to personal cloud if deleted after the weekend." },
      { id: "c", label: "Email the files to a personal account for convenience." },
      { id: "d", label: "Use a teammate's personal storage if they offer." },
    ],
  },
  {
    correctOptionId: "d",
    explanation:
      "Phishing links often mimic trusted brands with small URL changes. Reporting through the official channel lets security verify before anyone is compromised.",
    options: [
      { id: "a", label: "Click the link in a private browser to inspect it." },
      { id: "b", label: "Forward the message to the team chat for opinions." },
      { id: "c", label: "Ignore it unless antivirus blocks the page." },
      { id: "d", label: "Do not click; report via the official security/IT channel." },
    ],
  },
  {
    correctOptionId: "c",
    explanation:
      "Shared credentials break audit trails and violate Relanto and client access policy. Each person must use their own authorized account.",
    options: [
      { id: "a", label: "Share credentials temporarily because the demo is urgent." },
      { id: "b", label: "Send credentials on Teams and delete the message after." },
      { id: "c", label: "Refuse and request proper access through the approval process." },
      { id: "d", label: "Use the colleague's account if they insist." },
    ],
  },
  {
    correctOptionId: "b",
    explanation:
      "Client and internal data must not be entered into unapproved AI or third-party tools without written authorization. Approved channels preserve confidentiality.",
    options: [
      { id: "a", label: "Paste the log if the chatbot promises encryption." },
      { id: "b", label: "Use only approved tools or redacted samples with client/company approval." },
      { id: "c", label: "Paste data if you remove client names manually." },
      { id: "d", label: "Ask a friend outside Relanto to help draft the reply." },
    ],
  },
  {
    correctOptionId: "a",
    explanation:
      "Printed client information must be handled per clean-desk and secure disposal policy. Leaving reports in shared areas risks data exposure.",
    options: [
      { id: "a", label: "Secure or shred per policy and notify the document owner or security." },
      { id: "b", label: "Leave it; someone else will collect it." },
      { id: "c", label: "Take a photo for reference before discarding." },
      { id: "d", label: "Share a photo in the project group chat." },
    ],
  },
  {
    correctOptionId: "c",
    explanation:
      "Sensitive client data must not be shared on unmanaged personal devices without approval. Use approved secure channels and equipment first.",
    options: [
      { id: "a", label: "Join from personal phone and screen-share immediately." },
      { id: "b", label: "Read sensitive figures aloud instead of sharing screen." },
      { id: "c", label: "Use approved equipment/channels or reschedule until secure access is available." },
      { id: "d", label: "Record the call on a personal device for notes." },
    ],
  },
];

function generateLocalFallbackPool(
  fullText: string,
  pages: string[] = [],
  targetPoolSize = MIN_POOL_SIZE,
  startIndex = 0,
): GeneratedMcq[] {
  const passages = extractContentPassages(fullText, pages);
  const defaultTopic =
    "follow approved client security, data handling, and escalation procedures";
  const results: GeneratedMcq[] = [];
  const seen = new Set<string>();

  for (
    let attempt = 0;
    attempt < targetPoolSize * 3 && results.length < targetPoolSize;
    attempt++
  ) {
    const index = startIndex + attempt;
    const topic = passages[index % Math.max(passages.length, 1)] || defaultTopic;
    const prompt = buildRelantoScenarioPrompt(topic, index);
    const key = normalizeMcqPrompt(prompt);
    if (seen.has(key)) continue;
    seen.add(key);

    const answer = RELANTO_FALLBACK_ANSWERS[index % RELANTO_FALLBACK_ANSWERS.length];
    results.push({
      id: `local-fallback-${results.length + 1}`,
      slideIndex: (results.length + 1) * 3,
      prompt,
      correctOptionId: answer.correctOptionId,
      explanation: answer.explanation,
      options: answer.options,
    });
  }

  return results;
}

async function generateMcqPool(
  moduleTitle: string,
  fullText: string,
  targetPoolSize: number,
): Promise<GeneratedMcq[]> {
  const userPrompt = buildMcqUserPrompt({
    moduleTitle,
    fullText,
    questionCount: targetPoolSize,
  });
  let payload: LlmMcqPayload = {};

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const raw = await geminiChatJson(MCQ_SYSTEM_PROMPT, userPrompt, {
        maxTokens: 4500,
        temperature: 0.35,
      });
      const parsed = parseJsonObject(raw);
      if (parsed) {
        payload = parsed as unknown as LlmMcqPayload;
        break;
      }
      console.warn(`[mcq-generation] Invalid pool JSON attempt ${attempt}:`, raw.slice(0, 200));
    }
  } catch (err) {
    console.warn(
      "[mcq-generation] NVIDIA generation unavailable; using local fallback questions.",
      err instanceof Error ? err.message : err,
    );
    return generateLocalFallbackPool(fullText, [], targetPoolSize);
  }

  const questions = payload.questions ?? [];
  const accepted: GeneratedMcq[] = [];
  const seenPrompts = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const options = q.options ?? [];
    const ids = new Set(options.map((o) => o.id));
    const correct = q.correctOptionId;
    if (
      !q.prompt ||
      options.length !== 4 ||
      !correct ||
      !ids.has(correct) ||
      ids.size !== 4 ||
      !isAcceptableMcqPrompt(q.prompt, moduleTitle)
    ) {
      continue;
    }
    const promptKey = normalizeMcqPrompt(q.prompt);
    if (!promptKey || seenPrompts.has(promptKey)) {
      continue;
    }
    seenPrompts.add(promptKey);
    const normalizedOptions = options.map((o) => ({
      id: String(o.id).trim(),
      label: String(o.label).trim(),
    }));
    const correctLabel =
      normalizedOptions.find((o) => o.id === correct)?.label ?? "";

    accepted.push({
      id: `pool-${i + 1}`,
      slideIndex: (i + 1) * 3,
      prompt: q.prompt.trim(),
      correctOptionId: correct,
      explanation: normalizeMcqExplanation(q.explanation, correctLabel),
      options: normalizedOptions,
    });
    if (accepted.length >= targetPoolSize) break;
  }

  if (accepted.length < targetPoolSize) {
    const gap = targetPoolSize - accepted.length;
    const fillers = generateLocalFallbackPool(
      fullText,
      [],
      gap,
      accepted.length,
    );
    for (const filler of fillers) {
      const key = normalizeMcqPrompt(filler.prompt);
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      accepted.push({
        ...filler,
        id: `pool-${accepted.length + 1}`,
        slideIndex: (accepted.length + 1) * 3,
      });
      if (accepted.length >= targetPoolSize) break;
    }
  }

  return accepted;
}

async function generateSingleFallback(
  moduleTitle: string,
  fullText: string,
  index: number,
): Promise<GeneratedMcq | null> {
  const prompt = `Create exactly ONE Relanto workplace SCENARIO question (question #${index + 1}).

Requirements:
- Named Relanto employee in a specific situation grounded in the content below.
- NEVER mention the module title, PPT name, or "training module".
- 3–5 sentences, end with "What should [name] do?"
- 4 options (a–d). Two-sentence explanation.

Content:
---
${fullText.slice(0, 38000)}
---

Return strict JSON only.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await geminiChatJson(MCQ_SYSTEM_PROMPT, prompt, {
        maxTokens: 800,
        temperature: 0.2,
      });
      const parsed = parseJsonObject(raw) as SingleLlmPayload | null;
      if (!parsed) continue;
      const options = parsed.options ?? [];
      const ids = new Set(options.map((o) => o.id));
      const correct = parsed.correctOptionId;
      if (
        !parsed.prompt ||
        options.length !== 4 ||
        !correct ||
        !ids.has(correct) ||
        ids.size !== 4 ||
        !isAcceptableMcqPrompt(parsed.prompt, moduleTitle)
      ) {
        continue;
      }
      const normalizedOptions = options.map((o) => ({
        id: String(o.id).trim(),
        label: String(o.label).trim(),
      }));
      const correctLabel =
        normalizedOptions.find((o) => o.id === correct)?.label ?? "";

      return {
        id: `fallback-${index + 1}`,
        slideIndex: (index + 1) * 3,
        prompt: parsed.prompt.trim(),
        correctOptionId: correct,
        explanation: normalizeMcqExplanation(parsed.explanation, correctLabel),
        options: normalizedOptions,
      };
    } catch (err) {
      console.warn(
        "[mcq-generation] Single-question NVIDIA fallback unavailable.",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  return null;
}

/**
 * Generate checkpoint MCQs once per module (idempotent via content_hash).
 * Deletes prior MCQs for this module before inserting the new set.
 */
export async function generateAndStoreModuleMcqs(
  sql: ReturnType<typeof import("@/lib/db").getSql>,
  params: {
    moduleId: string;
    moduleTitle: string;
    pdfUrl: string;
    pageCount: number;
    contentHash: string;
    force?: boolean;
  },
): Promise<{ generated: number; skipped: boolean }> {
  const { moduleId, moduleTitle, pdfUrl, contentHash, pageCount, force = false } =
    params;
  const targetPoolSize = Math.max(MIN_POOL_SIZE, gateCountForSlides(pageCount));

  const existing = await sql`
    SELECT content_hash, mcq_generation_status
    FROM training_modules WHERE id = ${moduleId} LIMIT 1
  `;

  const priorHash = existing[0]?.content_hash as string | null;
  const countRows = await sql`
    SELECT COUNT(*)::int AS c FROM mcq_questions WHERE module_id = ${moduleId}
  `;
  const existingCount = Number(countRows[0]?.c ?? 0);

  if (
    !force &&
    priorHash === contentHash &&
    existingCount > 0 &&
    existing[0]?.mcq_generation_status === "completed"
  ) {
    return { generated: existingCount, skipped: true };
  }

  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'generating_5', content_hash = ${contentHash}, updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  await sql`DELETE FROM mcq_options WHERE question_id IN (
    SELECT id FROM mcq_questions WHERE module_id = ${moduleId}
  )`;
  await sql`DELETE FROM mcq_questions WHERE module_id = ${moduleId}`;

  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'generating_15', updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  const pages = await extractPdfPagesText(pdfUrl);
  const fullText = pages.join("\n\n").slice(0, 45000);
  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'generating_35', updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  let pool = await generateMcqPool(moduleTitle, fullText, targetPoolSize);

  if (pool.length < targetPoolSize) {
    for (let i = pool.length; i < targetPoolSize; i++) {
      const single = await generateSingleFallback(moduleTitle, fullText, i);
      if (single && isAcceptableMcqPrompt(single.prompt, moduleTitle)) {
        pool.push(single);
      }
    }
  }

  if (pool.length < targetPoolSize) {
    const localFallback = generateLocalFallbackPool(
      fullText,
      pages,
      targetPoolSize - pool.length,
      pool.length,
    );
    pool = [...pool, ...localFallback].slice(0, targetPoolSize);
  }
  await sql`
    UPDATE training_modules
    SET mcq_generation_status = 'generating_60', updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  let generated = 0;
  for (let i = 0; i < pool.length; i++) {
    const mcq = pool[i];
    const qId = `${moduleId}-pool-${i + 1}`;
    const remapped = shuffleAndRemapMcqOptions(
      mcq.options,
      mcq.correctOptionId,
      `${moduleId}:${qId}`,
    );
    await sql`
      INSERT INTO mcq_questions (id, module_id, slide_index, prompt, correct_option_id, explanation)
      VALUES (${qId}, ${moduleId}, ${mcq.slideIndex}, ${mcq.prompt}, ${remapped.correctOptionId}, ${mcq.explanation})
    `;
    for (const opt of remapped.options) {
      await sql`
        INSERT INTO mcq_options (id, question_id, label)
        VALUES (${opt.id}, ${qId}, ${opt.label})
      `;
    }
    generated++;
    const writeProgress = Math.min(95, 60 + Math.round(((i + 1) / Math.max(pool.length, 1)) * 35));
    await sql`
      UPDATE training_modules
      SET mcq_generation_status = ${`generating_${writeProgress}`}, updated_at = NOW()
      WHERE id = ${moduleId}
    `;
  }

  const status = generated > 0 ? "completed" : "failed";
  await sql`
    UPDATE training_modules
    SET mcq_generation_status = ${status}, updated_at = NOW()
    WHERE id = ${moduleId}
  `;

  if (status === "completed") {
    const { sendModuleInvitationEmails } = await import(
      "@/lib/services/training-notification-service"
    );
    void sendModuleInvitationEmails(sql, moduleId).catch((err) => {
      console.error("[mcq-generation invite emails]", err);
    });
  }

  if (generated === 0) {
    throw new Error(
      "Could not generate any checkpoint questions. Ensure the PDF has extractable text.",
    );
  }

  return { generated, skipped: false };
}

/**
 * Process-level cache for MCQ correct-answer lookups.
 *
 * Correct option ids are immutable per (moduleId, questionId). The first answer
 * submission for a module warms the cache by loading every question at once,
 * so subsequent submissions skip the DB roundtrip entirely on the critical path.
 *
 * NOTE: Cache is process-local — safe on Render (persistent Node process).
 * Serverless cold starts pay one warm cost per instance.
 */
import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

/** correctOptionId keyed by `${moduleId}::${questionId}`. */
const correctOptionCache = new Map<string, string>();
/** Modules we've already warmed so we don't reload all questions. */
const warmedModules = new Set<string>();

function cacheKey(moduleId: string, questionId: string): string {
  return `${moduleId}::${questionId}`;
}

async function warmCourseModule(sql: Sql, moduleId: string): Promise<void> {
  const rows = await sql`
    SELECT id, correct_option_id
    FROM course_mcq_questions
    WHERE module_id = ${moduleId}
  `;
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    const correct = String(row.correct_option_id ?? "").trim().toLowerCase();
    if (id && correct) correctOptionCache.set(cacheKey(moduleId, id), correct);
  }
  warmedModules.add(moduleId);
}

async function warmComplianceModule(sql: Sql, moduleId: string): Promise<void> {
  const rows = await sql`
    SELECT id, correct_option_id
    FROM mcq_questions
    WHERE module_id = ${moduleId}
  `;
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    const correct = String(row.correct_option_id ?? "").trim().toLowerCase();
    if (id && correct) correctOptionCache.set(cacheKey(moduleId, id), correct);
  }
  warmedModules.add(moduleId);
}

/**
 * Get the correct option id for a question. Warms the module cache on miss so
 * every question in the module is loaded in a single query.
 */
export async function getCachedCorrectOptionId(
  sql: Sql,
  moduleId: string,
  questionId: string,
  isCourse: boolean,
): Promise<string | null> {
  const key = cacheKey(moduleId, questionId);
  const hit = correctOptionCache.get(key);
  if (hit) return hit;
  if (!warmedModules.has(moduleId)) {
    if (isCourse) {
      await warmCourseModule(sql, moduleId);
    } else {
      await warmComplianceModule(sql, moduleId);
    }
    const warmed = correctOptionCache.get(key);
    if (warmed) return warmed;
  }
  return null;
}

/**
 * Warm the cache from questions already loaded for a module page — avoids a cold
 * first-answer DB hit during the quiz.
 */
export function warmMcqAnswerCacheFromQuestions(
  moduleId: string,
  questions: Array<{ id: string; correctOptionId?: string | null }>,
): void {
  for (const q of questions) {
    const id = String(q.id ?? "").trim();
    const correct = String(q.correctOptionId ?? "").trim().toLowerCase();
    if (id && correct) correctOptionCache.set(cacheKey(moduleId, id), correct);
  }
  warmedModules.add(moduleId);
}

/** Invalidate cache when an admin edits questions (call from course-service). */
export function invalidateMcqAnswerCacheForModule(moduleId: string): void {
  warmedModules.delete(moduleId);
  for (const key of correctOptionCache.keys()) {
    if (key.startsWith(`${moduleId}::`)) correctOptionCache.delete(key);
  }
}

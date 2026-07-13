/**
 * API + DB latency benchmark (production server on BASE_URL).
 * Usage: npm run benchmark:latency
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
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

loadEnv();

const BASE_URL = process.env.BENCHMARK_BASE_URL ?? "http://localhost:3000";

type TimedResult = { name: string; ms: number; status: number; ok: boolean };

async function timedFetch(
  name: string,
  path: string,
  init?: RequestInit,
): Promise<TimedResult> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, init);
  const ms = Math.round(performance.now() - start);
  let ok = res.ok;
  try {
    const json = await res.json();
    if (typeof json === "object" && json && "ok" in json) {
      ok = ok && Boolean((json as { ok: boolean }).ok);
    }
  } catch {
    /* non-json */
  }
  return { name, ms, status: res.status, ok };
}

async function runDbBenchmarks(): Promise<TimedResult[]> {
  const { getSql } = await import("../src/lib/db");
  const { getAnalytics } = await import("../src/lib/services/analytics-service");
  const { getBatchPerformance } = await import("../src/lib/services/batch-performance-service");
  const { listCourseLibraryDb } = await import("../src/lib/services/course-service");

  const sql = getSql();
  const results: TimedResult[] = [];

  const batches = await sql`SELECT id FROM batches LIMIT 1`;
  const batchId = (batches[0]?.id as string) ?? "";
  const modules = await sql`SELECT id FROM training_modules WHERE mcq_generation_status = 'completed' LIMIT 1`;
  const moduleId = (modules[0]?.id as string) ?? "";
  const questions = moduleId
    ? await sql`SELECT id FROM mcq_questions WHERE module_id = ${moduleId} LIMIT 1`
    : [];
  const questionId = (questions[0]?.id as string) ?? "";
  const progress = moduleId
    ? await sql`
        SELECT user_email, module_title, batch_id
        FROM assessment_progress
        WHERE module_id = ${moduleId}
        LIMIT 1
      `
    : [];
  const userEmail = (progress[0]?.user_email as string) ?? "";

  const bench = async (name: string, fn: () => Promise<unknown>) => {
    const start = performance.now();
    await fn();
    results.push({
      name: `db:${name}`,
      ms: Math.round(performance.now() - start),
      status: 200,
      ok: true,
    });
  };

  await bench("batches-list", () => sql`SELECT id, label FROM batches ORDER BY label`);
  if (batchId) {
    await bench("batch-performance", () => getBatchPerformance(sql, batchId));
  }
  await bench("analytics", () => getAnalytics(sql));
  await bench("course-library", () => listCourseLibraryDb(sql));

  if (moduleId && questionId && userEmail) {
    const { validateAndRecordMcqAnswerDb } = await import("../src/lib/services/progress-db-service");
    await bench("mcq-validate-readonly", async () => {
      await sql`
        SELECT q.correct_option_id
        FROM mcq_questions q
        WHERE q.id = ${questionId} AND q.module_id = ${moduleId}
        LIMIT 1
      `;
    });
    void validateAndRecordMcqAnswerDb;
  }

  return results;
}

async function main() {
  console.log(`\nLatency benchmark → ${BASE_URL}\n`);

  const apiRoutes: Array<{ name: string; path: string }> = [
    { name: "GET /api/batches", path: "/api/batches" },
    { name: "GET /api/analytics", path: "/api/analytics" },
    { name: "GET /api/content/course-library", path: "/api/content/course-library" },
    { name: "GET /api/content/library", path: "/api/content/library" },
    { name: "GET /api/auth/session", path: "/api/auth/session" },
  ];

  const batchesRes = await fetch(`${BASE_URL}/api/batches`).then((r) => r.json()).catch(() => null);
  const firstBatch =
    batchesRes?.ok && Array.isArray(batchesRes.batches) && batchesRes.batches[0]?.id
      ? String(batchesRes.batches[0].id)
      : null;
  if (firstBatch) {
    apiRoutes.push({
      name: "GET /api/analytics/batch/[id]",
      path: `/api/analytics/batch/${encodeURIComponent(firstBatch)}?track=compliance`,
    });
  }

  const warm = await Promise.all(apiRoutes.map((r) => timedFetch(`warm:${r.name}`, r.path)));
  const cold = await Promise.all(apiRoutes.map((r) => timedFetch(r.name, r.path)));

  const dbResults = await runDbBenchmarks().catch((err) => {
    console.warn("DB benchmarks skipped:", err instanceof Error ? err.message : err);
    return [] as TimedResult[];
  });

  const all = [...cold, ...dbResults];
  const width = Math.max(...all.map((r) => r.name.length), 28);

  console.log("API (2nd hit = cached server routes where applicable)");
  console.log("-".repeat(width + 24));
  for (const r of cold) {
    const flag = r.ok ? "✓" : "✗";
    console.log(`${r.name.padEnd(width)}  ${String(r.ms).padStart(5)} ms  ${flag} ${r.status}`);
  }

  if (dbResults.length) {
    console.log("\nDirect DB / services (no HTTP)");
    console.log("-".repeat(width + 24));
    for (const r of dbResults) {
      console.log(`${r.name.padEnd(width)}  ${String(r.ms).padStart(5)} ms  ✓`);
    }
  }

  const slow = all.filter((r) => r.ms > 800);
  if (slow.length) {
    console.log("\n⚠ Slower than 800ms:");
    for (const r of slow) console.log(`  - ${r.name}: ${r.ms}ms`);
  } else {
    console.log("\n✓ All checks under 800ms");
  }

  const avgApi = Math.round(cold.reduce((s, r) => s + r.ms, 0) / Math.max(cold.length, 1));
  console.log(`\nAPI average: ${avgApi}ms | warm pass avg: ${Math.round(warm.reduce((s, r) => s + r.ms, 0) / Math.max(warm.length, 1))}ms\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

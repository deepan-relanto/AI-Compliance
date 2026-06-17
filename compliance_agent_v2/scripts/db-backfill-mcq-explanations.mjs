/**
 * Backfill two-line explanations for questions with missing/generic text.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const raw = readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const GENERIC = [
  "approved compliance process instead of taking an unsafe shortcut",
  "follows the approved compliance process and avoids unsafe shortcuts",
  "checks whether the learner applies the approved compliance process",
];

function isGeneric(text) {
  if (!text?.trim()) return true;
  const lower = text.trim().toLowerCase();
  return GENERIC.some((m) => lower.includes(m));
}

function buildExplanation(label) {
  const action = (label || "the approved compliance process").trim();
  return `${action} follows the policy taught in this module. The other choices create avoidable security, privacy, or approval risk.`;
}

loadEnv();
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT q.id, q.explanation, o.label AS correct_label
  FROM mcq_questions q
  LEFT JOIN mcq_options o ON o.question_id = q.id AND o.id = q.correct_option_id
`;

let updated = 0;
for (const row of rows) {
  if (!isGeneric(row.explanation)) continue;
  const explanation = buildExplanation(row.correct_label);
  await sql`
    UPDATE mcq_questions
    SET explanation = ${explanation}
    WHERE id = ${row.id}
  `;
  updated++;
}

console.log(`Updated ${updated} question explanation(s).`);

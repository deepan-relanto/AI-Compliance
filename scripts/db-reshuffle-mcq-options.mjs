/**
 * Reshuffle MCQ option order and remap correct_option_id across a–d.
 * Fixes LLM bias where "a" was almost always correct.
 *
 * Usage: npm run db:reshuffle:mcqs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const OPTION_LETTERS = ["a", "b", "c", "d"];

function seededShuffle(items, seedText) {
  const arr = [...items];
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleAndRemapMcqOptions(options, correctOptionId, seed) {
  const shuffled = seededShuffle(options, seed);
  const oldToNew = new Map();
  shuffled.forEach((opt, index) => {
    oldToNew.set(opt.id, OPTION_LETTERS[index]);
  });
  return {
    options: shuffled.map((opt, index) => ({
      id: OPTION_LETTERS[index],
      label: opt.label,
    })),
    correctOptionId: oldToNew.get(correctOptionId) ?? correctOptionId,
  };
}

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

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("❌ Set DATABASE_URL in .env");
  process.exit(1);
}

const sql = neon(url);

const questions = await sql`
  SELECT id, module_id, correct_option_id
  FROM mcq_questions
  ORDER BY module_id, slide_index
`;

let updated = 0;
const distribution = { a: 0, b: 0, c: 0, d: 0 };

for (const q of questions) {
  const qId = q.id;
  const moduleId = q.module_id;
  const options = await sql`
    SELECT id, label FROM mcq_options WHERE question_id = ${qId} ORDER BY id
  `;

  if (options.length !== 4) continue;

  const remapped = shuffleAndRemapMcqOptions(
    options.map((o) => ({ id: o.id, label: o.label })),
    String(q.correct_option_id ?? "a"),
    `${moduleId}:${qId}:reshuffle-v1`,
  );

  await sql`DELETE FROM mcq_options WHERE question_id = ${qId}`;
  for (const opt of remapped.options) {
    await sql`
      INSERT INTO mcq_options (id, question_id, label)
      VALUES (${opt.id}, ${qId}, ${opt.label})
    `;
  }
  await sql`
    UPDATE mcq_questions
    SET correct_option_id = ${remapped.correctOptionId}
    WHERE id = ${qId}
  `;

  if (remapped.correctOptionId in distribution) {
    distribution[remapped.correctOptionId]++;
  }
  updated++;
}

console.log(`✅ Reshuffled ${updated} MCQ question(s).`);
console.log(
  `   Correct answer distribution: a=${distribution.a}, b=${distribution.b}, c=${distribution.c}, d=${distribution.d}`,
);

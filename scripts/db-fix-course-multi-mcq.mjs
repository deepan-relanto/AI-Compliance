/**
 * Fix multi-select MCQ correct_option_id values in course_mcq_questions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const fixes = [
  {
    id: "course-ai-basics-1783575957097-gate-0-6",
    correct: "a,c,e",
  },
  {
    id: "course-ai-basics-1783575957097-gate-0-10",
    correct: "a,b,c",
  },
  {
    id: "course-ai-basics-1783575957097-gate-0-17",
    correct: "a,c,d",
  },
];

for (const fix of fixes) {
  const updated = await sql`
    UPDATE course_mcq_questions
    SET correct_option_id = ${fix.correct}
    WHERE id = ${fix.id}
    RETURNING id, correct_option_id
  `;
  console.log(updated[0] ? `✅ ${updated[0].id} → ${updated[0].correct_option_id}` : `⚠️ ${fix.id} not found`);
}

await sql.end();

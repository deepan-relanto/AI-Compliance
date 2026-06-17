import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
}

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT prompt FROM mcq_questions
  WHERE module_id = 'security-awareness-latest-mpyddfmm'
  ORDER BY slide_index
  LIMIT 3
`;
for (const [i, row] of rows.entries()) {
  console.log(`${i + 1}. ${row.prompt}\n`);
}

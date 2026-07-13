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
const moduleId = "course-ai-basics-1783575957097";

const video = await sql`
  SELECT config FROM course_module_steps
  WHERE module_id = ${moduleId} AND step_type = 'video' LIMIT 1
`;
const assetUrl = video[0]?.config?.assetUrl;
const fn = String(assetUrl ?? "").replace("/course-assets/", "");
const blob = await sql`
  SELECT filename, mime_type, size_bytes, octet_length(data) AS byte_len
  FROM course_assets WHERE filename = ${fn}
`;
console.log("Video step config:", video[0]?.config);
console.log("Blob row:", blob[0]);

const pdf = await sql`
  SELECT config FROM course_module_steps
  WHERE module_id = ${moduleId} AND step_type = 'pdf' LIMIT 1
`;
console.log("PDF/HTML step:", pdf[0]?.config);

const opts = await sql`
  SELECT q.id, q.prompt, q.correct_option_id, count(o.id)::int AS option_count
  FROM course_mcq_questions q
  LEFT JOIN course_mcq_options o ON o.question_id = q.id
  WHERE q.module_id = ${moduleId}
  GROUP BY q.id, q.prompt, q.correct_option_id
  LIMIT 5
`;
console.log("MCQ sample:", opts);

await sql.end();

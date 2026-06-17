/**
 * Regenerate MCQs for modules that still have legacy fallback question text.
 */
import { neon } from "@neondatabase/serverless";
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
    /* optional */
  }
}

loadEnv();

const sql = neon(process.env.DATABASE_URL);

const modules = await sql`
  SELECT DISTINCT tm.id, tm.title, tm.pdf_url, tm.slide_count
  FROM training_modules tm
  JOIN mcq_questions mq ON mq.module_id = tm.id
  WHERE mq.prompt ILIKE '%most appropriate learner action for this guidance%'
     OR mq.prompt ILIKE '%Copyright%'
`;

if (modules.length === 0) {
  console.log("No modules with legacy fallback questions found.");
  process.exit(0);
}

console.log(`Regenerating MCQs for ${modules.length} module(s)...`);

for (const row of modules) {
  const res = await fetch(`http://localhost:3000/api/modules/${encodeURIComponent(row.id)}/generation-status`, {
    method: "POST",
  });
  const data = await res.json();
  console.log(`- ${row.title} (${row.id}):`, data.ok ? "queued" : data.message ?? "failed");
}

console.log("Done. Wait for generation to finish, then refresh training.");

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
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
  SELECT id, title, pdf_url, mcq_generation_status
  FROM training_modules
  ORDER BY created_at DESC NULLS LAST
  LIMIT 10
`;

for (const row of rows) {
  const rel = String(row.pdf_url ?? "").replace(/^\//, "");
  const exists = rel ? existsSync(join(root, "public", rel)) : false;
  console.log(`${row.title}\n  id=${row.id}\n  pdf=${row.pdf_url} (${exists ? "file ok" : "MISSING"})\n  mcq=${row.mcq_generation_status}\n`);
}

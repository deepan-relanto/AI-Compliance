/**
 * Recompute batches.member_count from live users roster.
 * Usage: node scripts/db-sync-member-counts.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const sql = neon(process.env.DATABASE_URL);

const before = await sql`
  SELECT b.id, b.label, b.member_count AS stored,
    (SELECT COUNT(*)::int FROM users u WHERE u.batch_id = b.id AND u.role = 'user') AS actual
  FROM batches b
  ORDER BY b.label
`;
console.log("Before:");
for (const r of before) {
  const flag = r.stored === r.actual ? "ok" : "DRIFT";
  console.log(`  [${flag}] ${r.label}: stored=${r.stored} actual=${r.actual}`);
}

await sql`
  UPDATE batches b
  SET member_count = COALESCE((
    SELECT COUNT(*)::int FROM users u WHERE u.batch_id = b.id AND u.role = 'user'
  ), 0),
  updated_at = NOW()
`;

const after = await sql`
  SELECT b.id, b.label, b.member_count AS stored,
    (SELECT COUNT(*)::int FROM users u WHERE u.batch_id = b.id AND u.role = 'user') AS actual
  FROM batches b
  ORDER BY b.label
`;
console.log("\nAfter:");
for (const r of after) {
  console.log(`  ${r.label}: ${r.stored}`);
}
console.log("\nDone.");

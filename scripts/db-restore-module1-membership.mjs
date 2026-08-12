/**
 * Restore Manisha & Sharmila on Module_1 as completed for AI Basics,
 * keep Relanto Academy membership, and resync member counts.
 *
 * Usage: node scripts/db-restore-module1-membership.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const sql = neon(process.env.DATABASE_URL);

const EMAILS = ["manisha.nair@relanto.ai", "sharmila.r@relanto.ai"];
const MODULE1 = "module_1_ai_basics_batch_1_glvf";
const ACADEMY = "relanto_academy_p1rj";

const batchRows = await sql`
  SELECT id, label, member_count FROM batches
  WHERE id IN (${MODULE1}, ${ACADEMY})
`;
console.log("batches before:", batchRows);

const progressBefore = await sql`
  SELECT user_email, module_id, module_title, batch_id, status, score_percent
  FROM course_progress
  WHERE LOWER(user_email) = ANY(${EMAILS})
`;
console.log("progress before:", progressBefore);

// Ensure multi-batch membership for both batches
for (const batchId of [MODULE1, ACADEMY]) {
  await sql`
    INSERT INTO user_batches (user_email, batch_id)
    SELECT * FROM unnest(
      ${EMAILS}::text[],
      ARRAY[${batchId}, ${batchId}]::text[]
    ) AS t(user_email, batch_id)
    ON CONFLICT DO NOTHING
  `;
}

// Point AI Basics completion back at Module_1 (not Academy)
const aiBasicsIds = await sql`
  SELECT DISTINCT module_id
  FROM course_progress
  WHERE LOWER(user_email) = ANY(${EMAILS})
    AND (
      module_id ILIKE '%ai-basics%'
      OR module_title ILIKE '%ai basics%'
      OR module_title ILIKE '%ai basic%'
    )
`;
console.log("ai basics module ids:", aiBasicsIds);

for (const row of aiBasicsIds) {
  const moduleId = row.module_id;
  const updated = await sql`
    UPDATE course_progress
    SET batch_id = ${MODULE1},
        status = 'completed',
        updated_at = NOW()
    WHERE LOWER(user_email) = ANY(${EMAILS})
      AND module_id = ${moduleId}
    RETURNING user_email, module_id, batch_id, status, score_percent
  `;
  console.log("progress restored:", updated);
}

// Prefer Module_1 as primary roster pointer so admin lists stay intuitive;
// Academy membership remains via user_batches.
await sql`
  UPDATE users
  SET batch_id = ${MODULE1}, updated_at = NOW()
  WHERE LOWER(email) = ANY(${EMAILS})
`;

// Resync member counts from user_batches
await sql`
  UPDATE batches b
  SET member_count = COALESCE(ub.c, 0), updated_at = NOW()
  FROM (
    SELECT batch_id, COUNT(*)::int AS c
    FROM user_batches
    GROUP BY batch_id
  ) ub
  WHERE b.id = ub.batch_id
`;
await sql`
  UPDATE batches b
  SET member_count = 0, updated_at = NOW()
  WHERE NOT EXISTS (SELECT 1 FROM user_batches ub WHERE ub.batch_id = b.id)
    AND b.member_count <> 0
`;

const after = await sql`
  SELECT id, label, member_count FROM batches
  WHERE id IN (${MODULE1}, ${ACADEMY})
`;
const membership = await sql`
  SELECT user_email, batch_id FROM user_batches
  WHERE LOWER(user_email) = ANY(${EMAILS})
  ORDER BY user_email, batch_id
`;
const users = await sql`
  SELECT email, batch_id FROM users WHERE LOWER(email) = ANY(${EMAILS})
`;
const progressAfter = await sql`
  SELECT user_email, module_id, module_title, batch_id, status, score_percent
  FROM course_progress
  WHERE LOWER(user_email) = ANY(${EMAILS})
`;

console.log("batches after:", after);
console.log("membership:", membership);
console.log("users primary:", users);
console.log("progress after:", progressAfter);
console.log("done");

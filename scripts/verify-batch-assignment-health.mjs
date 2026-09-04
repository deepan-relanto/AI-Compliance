/**
 * Live DB sanity checks for the SF_B2 / multi-batch assignment bugs.
 * Usage: node scripts/verify-batch-assignment-health.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  moduleVisibleOnBatch,
  resolveAttributedBatchId,
} from "../src/lib/batch-attribution.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const sql = neon(process.env.DATABASE_URL);
const MOD = "course-ai-basics-1783575957097";
const SF = "support_function_batch_2";
const PLAN = "planning_team";
const HYD = "hyderabad_team";

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

const junction = await sql`
  SELECT batch_id FROM course_module_batches WHERE module_id = ${MOD} ORDER BY batch_id
`;
const junctionIds = junction.map((r) => r.batch_id);
assert(junctionIds.includes(SF), "AI basics assigned to SF_B2");
assert(junctionIds.includes(PLAN), "AI basics assigned to Planning");

for (const batchId of [SF, PLAN, HYD]) {
  const rows = await sql`
    SELECT m.id, m.title
    FROM course_modules m
    WHERE m.id = ${MOD}
      AND m.id IN (
      SELECT module_id FROM course_module_batches WHERE batch_id = ${batchId}
      UNION
      SELECT DISTINCT module_id FROM course_notification_events
      WHERE batch_id = ${batchId} AND notification_type = 'invited'
      UNION
      SELECT DISTINCT p.module_id FROM course_progress p
      WHERE COALESCE(
        CASE
          WHEN EXISTS (
            SELECT 1 FROM course_module_batches cmb
            WHERE cmb.module_id = p.module_id AND cmb.batch_id = p.batch_id
          ) THEN p.batch_id
        END,
        (
          SELECT ub.batch_id
          FROM user_batches ub
          INNER JOIN course_module_batches cmb
            ON cmb.batch_id = ub.batch_id AND cmb.module_id = p.module_id
          WHERE LOWER(ub.user_email) = LOWER(p.user_email)
          ORDER BY ub.created_at ASC
          LIMIT 1
        ),
        p.batch_id
      ) = ${batchId}
    )
  `;
  if (batchId === HYD) {
    assert(rows.length === 0, "Hyderabad does not list AI basics from mis-stamps");
  } else {
    assert(rows.length === 1, `${batchId} lists AI basics`);
  }
}

const outreach = await sql`
  SELECT COUNT(*)::int AS n
  FROM users u
  INNER JOIN user_batches ub ON LOWER(ub.user_email) = LOWER(u.email)
  WHERE u.role IN ('user', 'admin')
    AND ub.batch_id = ${SF}
    AND (
      EXISTS (
        SELECT 1 FROM course_module_batches mb
        WHERE mb.batch_id = ub.batch_id AND mb.module_id = ${MOD}
      )
      OR EXISTS (
        SELECT 1 FROM course_notification_events e
        WHERE e.module_id = ${MOD}
          AND e.batch_id = ub.batch_id
          AND e.notification_type = 'invited'
          AND LOWER(e.user_email) = LOWER(u.email)
      )
      OR EXISTS (
        SELECT 1 FROM course_progress p
        WHERE p.module_id = ${MOD}
          AND p.batch_id = ub.batch_id
          AND LOWER(p.user_email) = LOWER(u.email)
      )
    )
`;
assert(Number(outreach[0].n) === 24, `SF_B2 outreach roster is 24 (got ${outreach[0].n})`);

const monitored = await sql`
  SELECT COUNT(*)::int AS n
  FROM course_notification_events e
  WHERE e.module_id = ${MOD}
    AND COALESCE(
      CASE
        WHEN e.batch_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM course_module_batches cmb
          WHERE cmb.module_id = e.module_id AND cmb.batch_id = e.batch_id
        ) THEN e.batch_id
      END,
      (
        SELECT ub.batch_id
        FROM user_batches ub
        INNER JOIN course_module_batches cmb
          ON cmb.batch_id = ub.batch_id AND cmb.module_id = e.module_id
        WHERE LOWER(ub.user_email) = LOWER(e.user_email)
        ORDER BY ub.created_at ASC
        LIMIT 1
      ),
      e.batch_id
    ) = ${SF}
`;
assert(Number(monitored[0].n) > 0, `SF_B2 email monitoring still shows events (${monitored[0].n})`);

assert(
  resolveAttributedBatchId({
    storedBatchId: HYD,
    storedBatchHasAssignment: false,
    membershipAssignedBatchIds: [PLAN],
  }) === PLAN,
  "dual-batch Hyderabad stamp remaps to Planning",
);
assert(
  moduleVisibleOnBatch({
    currentlyAssigned: false,
    hasInviteForBatch: false,
    hasAttributedProgress: false,
  }) === false,
  "mis-stamped progress alone does not show module on batch",
);
assert(
  moduleVisibleOnBatch({
    currentlyAssigned: false,
    hasInviteForBatch: true,
    hasAttributedProgress: true,
  }) === true,
  "invite history keeps previously assigned module visible",
);

console.log("\nAll batch-assignment health checks passed.");

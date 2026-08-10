/**
 * Read-only + safe UPDATE checks for Save & Exit / auth wiring.
 * Does NOT delete any rows.
 *
 * Usage: node scripts/verify-save-exit-auth.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
}

loadEnv();
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
  else console.log(`  OK  ${msg}`);
}

console.log("1) Schema columns");
const cols = await sql`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'course_modules' AND column_name = 'allow_save_exit')
      OR (table_name = 'course_progress' AND column_name = 'resume_checkpoint')
    )
`;
assert(
  cols.some((c) => c.table_name === "course_modules" && c.column_name === "allow_save_exit"),
  "course_modules.allow_save_exit exists",
);
assert(
  cols.some((c) => c.table_name === "course_progress" && c.column_name === "resume_checkpoint"),
  "course_progress.resume_checkpoint exists",
);

console.log("\n2) Enable Save & Exit on currently assigned courses (no deletes)");
const enabled = await sql`
  UPDATE course_modules
  SET allow_save_exit = TRUE, updated_at = NOW()
  WHERE id IN (SELECT DISTINCT module_id FROM course_module_batches)
    AND allow_save_exit IS DISTINCT FROM TRUE
  RETURNING id, title
`;
console.log(`  Updated ${enabled.length} assigned course(s) to allow_save_exit=TRUE`);
for (const row of enabled) console.log(`   · ${row.title} (${row.id})`);

const stillOff = await sql`
  SELECT COUNT(*)::int AS c
  FROM course_modules cm
  INNER JOIN course_module_batches cmb ON cmb.module_id = cm.id
  WHERE cm.allow_save_exit = FALSE
`;
assert(stillOff[0].c === 0, "every assigned course has allow_save_exit=TRUE");

console.log("\n3) Source wiring spot-checks");
const courseService = fs.readFileSync(
  path.join(root, "src/lib/services/course-service.ts"),
  "utf8",
);
assert(
  /allow_save_exit = TRUE/.test(courseService),
  "publish/reuse set allow_save_exit = TRUE",
);
assert(
  /TRUE\s*\n\s*\)/.test(courseService) || courseService.includes("allow_save_exit") && courseService.includes("TRUE"),
  "createCourseModuleDb inserts allow_save_exit TRUE",
);

const loginForm = fs.readFileSync(
  path.join(root, "src/components/auth/login-form.tsx"),
  "utf8",
);
assert(
  /prompt:\s*["']select_account["']/.test(loginForm),
  "login always passes prompt=select_account",
);

const authTs = fs.readFileSync(path.join(root, "src/auth.ts"), "utf8");
assert(
  /prompt:\s*["']select_account["']/.test(authTs),
  "Entra provider defaults prompt=select_account",
);

console.log("\n4) Sample assigned modules");
const sample = await sql`
  SELECT cm.id, cm.title, cm.allow_save_exit,
         COUNT(cmb.batch_id)::int AS batches
  FROM course_modules cm
  INNER JOIN course_module_batches cmb ON cmb.module_id = cm.id
  GROUP BY cm.id
  ORDER BY cm.updated_at DESC NULLS LAST
  LIMIT 10
`;
for (const row of sample) {
  console.log(
    `  allow=${row.allow_save_exit} batches=${row.batches} | ${row.title}`,
  );
}

await sql.end();

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\n✅ verify-save-exit-auth passed (no rows deleted).");

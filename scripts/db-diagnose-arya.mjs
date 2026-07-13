import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
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

const email = (process.argv[2] ?? "arya.chaudhari@relanto.ai").trim().toLowerCase();
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const users = await sql`
  SELECT email, display_name, batch_id, role FROM users
  WHERE LOWER(email) = ${email} OR LOWER(display_name) LIKE ${"%arya%"}
`;
console.log("Users:", users);

const batchIds = [...new Set(users.map((u) => u.batch_id).filter(Boolean))];
console.log("Batch IDs:", batchIds);

for (const bid of batchIds) {
  const courseAssignments = await sql`
    SELECT cm.id, cm.title, mb.batch_id
    FROM course_module_batches mb
    INNER JOIN course_modules cm ON cm.id = mb.module_id
    WHERE mb.batch_id = ${bid}
  `;
  const complianceAssignments = await sql`
    SELECT tm.id, tm.title, mb.batch_id
    FROM module_batches mb
    INNER JOIN training_modules tm ON tm.id = mb.module_id
    WHERE mb.batch_id = ${bid}
  `;
  console.log(`\nBatch ${bid} — course assignments:`, courseAssignments);
  console.log(`Batch ${bid} — compliance assignments:`, complianceAssignments);
}

for (const bid of batchIds) {
  const users = await sql`SELECT email, display_name FROM users WHERE batch_id = ${bid}`;
  console.log(`\nUsers in batch ${bid}:`, users);
}
const progressBatches = await sql`
  SELECT DISTINCT batch_id FROM course_progress WHERE LOWER(user_email) = ${email}
`;
for (const row of progressBatches) {
  const bid = row.batch_id;
  if (batchIds.includes(bid)) continue;
  const courseAssignments = await sql`
    SELECT cm.id, cm.title, mb.batch_id
    FROM course_module_batches mb
    INNER JOIN course_modules cm ON cm.id = mb.module_id
    WHERE mb.batch_id = ${bid}
  `;
  console.log(`\nLegacy batch ${bid} — course assignments:`, courseAssignments);
}

const courseProgress = await sql`
  SELECT module_id, module_title, status, warning_count, batch_id
  FROM course_progress WHERE LOWER(user_email) = ${email}
`;
const complianceProgress = await sql`
  SELECT module_id, module_title, status, warning_count, batch_id
  FROM assessment_progress WHERE LOWER(user_email) = ${email}
`;
console.log("\nCourse progress:", courseProgress);
console.log("\nCompliance progress:", complianceProgress);

const courseInvites = await sql`
  SELECT module_id, notification_type, sent_at
  FROM course_notifications WHERE LOWER(user_email) = ${email}
`;
const complianceInvites = await sql`
  SELECT module_id, notification_type, sent_at
  FROM training_notifications WHERE LOWER(user_email) = ${email}
`;
console.log("\nCourse notifications:", courseInvites);
console.log("\nCompliance notifications:", complianceInvites);

const courseReviews = await sql`
  SELECT id, module_id, status FROM course_review_requests
  WHERE LOWER(username) = ${email}
`;
console.log("\nCourse reviews:", courseReviews);

await sql.end();

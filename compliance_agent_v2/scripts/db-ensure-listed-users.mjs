/**
 * Ensure specific Relanto emails exist in users (SSO placeholder password).
 * Run: node scripts/db-ensure-listed-users.mjs
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
    /* ignore */
  }
}

function displayNameFromEmail(email) {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

loadEnv();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("Set DATABASE_URL in .env");
  process.exit(1);
}

const sql = neon(url);
const SSO_PLACEHOLDER = "microsoft-sso";

/** Names from Relanto HR master roster (scripts/data/employees-master.csv). */
const PEOPLE = [
  { email: "ynayak@relanto.ai", displayName: "Yeshwant Nayak" },
  { email: "rajan@relanto.ai", displayName: "Rajan Gaur" },
  { email: "venkatesh@relanto.ai", displayName: "Venkatesh Kodangal" },
  { email: "schowhan@relanto.ai", displayName: "Shankar Chowhan" },
  { email: "santhi@relanto.ai", displayName: "Santhi Kanumuri" },
  { email: "raamanathan.gururajan@relanto.ai", displayName: "Raamanathan Gururajan" },
  { email: "pooja.pura@relanto.ai", displayName: "Pooja Pura" },
  { email: "prasanna.rs@relanto.ai", displayName: "Prasanna R S" },
  { email: "vincent@relanto.ai", displayName: "Vincent T P" },
];

const emails = PEOPLE.map((p) => p.email.toLowerCase());

const existing = await sql`
  SELECT email, display_name, role, batch_id
  FROM users
  WHERE LOWER(email) = ANY(${emails})
  ORDER BY email
`;

const existingByLower = new Map(
  existing.map((row) => [String(row.email).toLowerCase(), row]),
);

console.log("=== CURRENT MATCHES ===");
for (const person of PEOPLE) {
  const row = existingByLower.get(person.email.toLowerCase());
  if (row) {
    console.log("EXISTS", row.email, "|", row.display_name, "|", row.role, "|", row.batch_id);
  } else {
    console.log("MISSING", person.email);
  }
}

const batches = await sql`SELECT id FROM batches ORDER BY id`;
const batchIds = new Set(batches.map((b) => String(b.id)));
const leadersBatch = batchIds.has("relanto_leaders") ? "relanto_leaders" : null;
const defaultBatch =
  leadersBatch ||
  batches.find((b) => String(b.id).includes("relanto"))?.id ||
  batches[0]?.id ||
  null;

const LEADER_EMAILS = new Set([
  "ynayak@relanto.ai",
  "rajan@relanto.ai",
  "venkatesh@relanto.ai",
  "schowhan@relanto.ai",
  "santhi@relanto.ai",
  "pooja.pura@relanto.ai",
  "vincent@relanto.ai",
  "raamanathan.gururajan@relanto.ai",
]);

console.log("\nDefault batch for new users:", defaultBatch);
console.log("Leaders batch:", leadersBatch);

for (const person of PEOPLE) {
  const key = person.email.toLowerCase();
  const row = existingByLower.get(key);
  const displayName = person.displayName || displayNameFromEmail(person.email);

  if (row) {
    // Refresh display_name from HR roster when blank or email-derived stub.
    const current = String(row.display_name ?? "").trim();
    if (!current || current.toLowerCase() !== displayName.toLowerCase()) {
      await sql`
        UPDATE users
        SET display_name = ${displayName}, updated_at = NOW()
        WHERE LOWER(email) = ${key}
      `;
      console.log("UPDATED name:", person.email, "→", displayName);
    }
    continue;
  }

  // Prefer looking up HR employees table for a richer name.
  const emp = await sql`
    SELECT name FROM employees
    WHERE LOWER(work_email) = ${key}
    LIMIT 1
  `;
  const name = emp[0]?.name ? String(emp[0].name).trim() : displayName;
  const batchId =
    (LEADER_EMAILS.has(key) && leadersBatch) || defaultBatch;

  await sql`
    INSERT INTO users (email, password_hash, role, batch_id, display_name)
    VALUES (
      ${key},
      ${SSO_PLACEHOLDER},
      'user',
      ${batchId},
      ${name}
    )
    ON CONFLICT (email) DO UPDATE SET
      display_name = COALESCE(NULLIF(TRIM(users.display_name), ''), EXCLUDED.display_name),
      updated_at = NOW()
  `;
  console.log("INSERTED:", key, "→", name, "batch:", batchId);
}

const after = await sql`
  SELECT email, display_name, role, batch_id
  FROM users
  WHERE LOWER(email) = ANY(${emails})
  ORDER BY email
`;
console.log("\n=== AFTER ===");
console.log(JSON.stringify(after, null, 2));

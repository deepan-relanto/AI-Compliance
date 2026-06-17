/**
 * Seed Relanto @relanto.ai users + five teams (Microsoft SSO — no password login).
 * Also removes legacy demo batches (batch_a/b/c).
 * Run: node scripts/db-seed-relanto-users.mjs
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

function firstNameFromEmail(email) {
  const local = email.split("@")[0] ?? email;
  const segment = local.split(".")[0] ?? local;
  if (!segment) return "Learner";
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

loadEnv();

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();

if (!url) {
  console.error("❌ Set DATABASE_URL in .env");
  process.exit(1);
}

const sql = neon(url);

const SSO_PLACEHOLDER = "microsoft-sso";

const LEGACY_BATCH_IDS = ["batch_a", "batch_b", "batch_c"];

const batches = [
  {
    id: "relanto_team_1",
    label: "Relanto Team 1",
    description: "Compliance cohort — team one",
    member_count: 4,
  },
  {
    id: "relanto_team_2",
    label: "Relanto Team 2",
    description: "Compliance cohort — team two",
    member_count: 3,
  },
  {
    id: "relanto_team_3",
    label: "Relanto Team 3",
    description: "Test cohort before wider rollout",
    member_count: 4,
  },
  {
    id: "relanto_team_4",
    label: "Relanto Team 4",
    description: "Compliance cohort — team four",
    member_count: 1,
  },
  {
    id: "relanto_team_5",
    label: "Relanto Team 5",
    description: "Compliance cohort — team five",
    member_count: 1,
  },
  {
    id: "relanto_leaders",
    label: "Relanto Leaders",
    description: "Leadership compliance cohort",
    member_count: 4,
  },
];

const users = [
  {
    email: "deepan.s@relanto.ai",
    role: "admin",
    batch_id: null,
  },
  {
    email: "gudivaka.vennela@relanto.ai",
    role: "user",
    batch_id: "relanto_team_1",
  },
  {
    email: "hridyalakshmi.santhosh@relanto.ai",
    role: "user",
    batch_id: "relanto_team_3",
  },
  {
    email: "shreyas.shankar@relanto.ai",
    role: "user",
    batch_id: "relanto_team_3",
  },
  {
    email: "nihaarrai.v@relanto.ai",
    role: "user",
    batch_id: "relanto_team_3",
  },
  {
    email: "lakhi.ashetty@relanto.ai",
    role: "user",
    batch_id: "relanto_team_3",
  },
  {
    email: "manisha.nair@relanto.ai",
    role: "user",
    batch_id: "relanto_team_1",
  },
  {
    email: "sharmila.r@relanto.ai",
    role: "user",
    batch_id: "relanto_team_1",
  },
  {
    email: "vincent@relanto.ai",
    role: "user",
    batch_id: "relanto_team_1",
  },
  {
    email: "arushi.gupta@relanto.ai",
    role: "user",
    batch_id: "relanto_team_2",
  },
  {
    email: "gaury.jitesh@relanto.ai",
    role: "user",
    batch_id: "relanto_team_2",
  },
  {
    email: "srinithi.v@relanto.ai",
    role: "user",
    batch_id: "relanto_team_2",
  },
  {
    email: "prasanna.rs@relanto.ai",
    role: "user",
    batch_id: "relanto_team_4",
  },
  {
    email: "pramath.naik@relanto.ai",
    role: "user",
    batch_id: "relanto_team_5",
  },
  {
    email: "venkatesh@relanto.ai",
    role: "user",
    batch_id: "relanto_leaders",
  },
  {
    email: "santhi@relanto.ai",
    role: "user",
    batch_id: "relanto_leaders",
  },
  {
    email: "sanjay.mathur@relanto.ai",
    role: "user",
    batch_id: "relanto_leaders",
  },
  {
    email: "praveen.rajan@relanto.ai",
    role: "user",
    batch_id: "relanto_leaders",
  },
];

console.log("Removing legacy demo batches…");

for (const batchId of LEGACY_BATCH_IDS) {
  const progress = await sql`
    DELETE FROM assessment_progress WHERE batch_id = ${batchId} RETURNING id
  `;
  const links = await sql`
    DELETE FROM module_batches WHERE batch_id = ${batchId} RETURNING module_id
  `;
  const sessions = await sql`
    DELETE FROM live_sessions WHERE batch_id = ${batchId} RETURNING id
  `;
  const demoUsers = await sql`
    DELETE FROM users WHERE batch_id = ${batchId} RETURNING email
  `;
  const removed = await sql`
    DELETE FROM batches WHERE id = ${batchId} RETURNING id
  `;
  if (removed.length > 0) {
    console.log(
      `  · ${batchId}: batch + ${demoUsers.length} user(s), ${progress.length} progress row(s)`,
    );
  }
}

const relntoDemo = await sql`
  DELETE FROM users WHERE email LIKE '%@relnto.com' RETURNING email
`;
if (relntoDemo.length > 0) {
  console.log(`  · removed ${relntoDemo.length} @relnto.com demo user(s)`);
}

await sql`
  UPDATE users SET batch_id = NULL, updated_at = NOW()
  WHERE LOWER(email) IN ('deepan.s@relanto.com', 'deepan.s@relanto.ai')
    AND role = 'admin'
`;

console.log("\nSeeding Relanto Microsoft SSO users…");

for (const b of batches) {
  await sql`
    INSERT INTO batches (id, label, description, member_count, compliance, pass_rate, fail_rate, active_sessions)
    VALUES (${b.id}, ${b.label}, ${b.description}, ${b.member_count}, 0, 0, 0, 0)
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      member_count = EXCLUDED.member_count,
      updated_at = NOW()
  `;
}

for (const u of users) {
  const displayName = firstNameFromEmail(u.email);
  await sql`
    INSERT INTO users (email, password_hash, role, batch_id, display_name)
    VALUES (${u.email}, ${SSO_PLACEHOLDER}, ${u.role}, ${u.batch_id}, ${displayName})
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      batch_id = EXCLUDED.batch_id,
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
  `;
  console.log(`  ✓ ${displayName} <${u.email}> → ${u.batch_id} (${u.role})`);
}

console.log("\n✅ Relanto users ready. Sign in at /login with Continue with Microsoft.");

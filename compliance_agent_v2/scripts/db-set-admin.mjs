/**
 * Set sole platform admin. Usage: node scripts/db-set-admin.mjs
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.DATABASE_URL?.trim() || process.env.postgres_neon?.trim();
if (!url) {
  console.error("❌ DATABASE_URL required");
  process.exit(1);
}

const ADMIN_EMAILS = ["deepan.s@relanto.com", "deepan.s@relanto.ai"];
const sql = neon(url);

await sql`
  UPDATE users SET role = 'user' WHERE role = 'admin'
`;

for (const email of ADMIN_EMAILS) {
  await sql`
    INSERT INTO users (email, password_hash, role, batch_id, display_name)
    VALUES (${email}, 'microsoft-sso', 'admin', NULL, 'Deepan')
    ON CONFLICT (email) DO UPDATE SET
      role = 'admin',
      batch_id = NULL,
      display_name = 'Deepan',
      updated_at = NOW()
  `;
  console.log(`  ✓ Admin: ${email}`);
}

console.log("\n✅ Deepan admin accounts ready.");

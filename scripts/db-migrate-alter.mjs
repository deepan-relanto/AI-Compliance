/**
 * Adds columns introduced after initial schema (safe to re-run).
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

await sql`ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS content_hash TEXT`;
await sql`ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS mcq_generation_status TEXT NOT NULL DEFAULT 'pending'`;
await sql`ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS module_kind TEXT NOT NULL DEFAULT 'compliance'`;
await sql`UPDATE training_modules SET module_kind = 'compliance' WHERE module_kind IS NULL OR module_kind NOT IN ('compliance', 'course')`;

await sql`ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS explanation TEXT`;
await sql`
  UPDATE mcq_questions
  SET explanation = 'This checks whether the learner applies the approved compliance process instead of taking an unsafe shortcut.'
  WHERE explanation IS NULL OR btrim(explanation) = ''
`;

await sql`ALTER TABLE assessment_progress ADD COLUMN IF NOT EXISTS mcq_correct INTEGER NOT NULL DEFAULT 0`;
await sql`ALTER TABLE assessment_progress ADD COLUMN IF NOT EXISTS mcq_total INTEGER NOT NULL DEFAULT 0`;
await sql`ALTER TABLE assessment_progress ADD COLUMN IF NOT EXISTS score_percent INTEGER`;
await sql`ALTER TABLE assessment_progress ADD COLUMN IF NOT EXISTS mcq_answers JSONB NOT NULL DEFAULT '{}'::jsonb`;

await sql`ALTER TABLE upload_files ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES training_modules(id) ON DELETE SET NULL`;
await sql`ALTER TABLE upload_files ADD COLUMN IF NOT EXISTS content_hash TEXT`;

await sql`
  CREATE TABLE IF NOT EXISTS training_notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id         TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    user_email        TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('invited', 'completed')),
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, user_email, notification_type)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_training_notifications_module ON training_notifications(module_id)`;

await sql`
  CREATE TABLE IF NOT EXISTS pdf_storage (
    filename      TEXT PRIMARY KEY,
    pdf_url       TEXT NOT NULL,
    data          BYTEA NOT NULL,
    content_hash  TEXT,
    size_bytes    BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_pdf_storage_url ON pdf_storage(pdf_url)`;

await sql`
  CREATE TABLE IF NOT EXISTS employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    work_email      TEXT NOT NULL,
    date_of_birth   DATE,
    gender          TEXT,
    location        TEXT,
    department      TEXT,
    sub_department  TEXT,
    job_title       TEXT,
    reporting_to    TEXT,
    date_joined     DATE,
    worker_type     TEXT,
    primary_skills  TEXT,
    secondary_skills TEXT,
    certifications  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(LOWER(work_email))`;
await sql`CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department)`;
await sql`CREATE INDEX IF NOT EXISTS idx_employees_location ON employees(location)`;
await sql`CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title)`;
await sql`CREATE INDEX IF NOT EXISTS idx_employees_date_joined ON employees(date_joined)`;
await sql`CREATE INDEX IF NOT EXISTS idx_employees_gender ON employees(gender)`;

await sql`
  CREATE TABLE IF NOT EXISTS module_steps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    step_order  INTEGER NOT NULL,
    step_type   TEXT NOT NULL CHECK (step_type IN ('pdf', 'video', 'mindmap', 'infographic', 'quiz')),
    title       TEXT NOT NULL DEFAULT '',
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, step_order),
    UNIQUE (module_id, step_type)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_module_steps_module ON module_steps(module_id)`;

await sql`
  CREATE TABLE IF NOT EXISTS course_assets (
    filename    TEXT PRIMARY KEY,
    asset_url   TEXT NOT NULL UNIQUE,
    mime_type   TEXT NOT NULL,
    size_bytes  BIGINT,
    data        BYTEA NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_assets_url ON course_assets(asset_url)`;

await sql`CREATE INDEX IF NOT EXISTS idx_progress_module ON assessment_progress(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_progress_completed_at ON assessment_progress(completed_at) WHERE completed_at IS NOT NULL`;
await sql`CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON assessment_progress(updated_at)`;
await sql`CREATE INDEX IF NOT EXISTS idx_module_batches_batch ON module_batches(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_module_batches_module ON module_batches(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_mcq_questions_module ON mcq_questions(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_progress_user_module ON assessment_progress(user_email, module_id)`;

// Allow Consumed status on proctor retake approvals (one-time use).
await sql`ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_status_check`;
await sql`
  ALTER TABLE review_requests
  ADD CONSTRAINT review_requests_status_check
  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Consumed'))
`;

console.log("✅ Schema alterations applied.");

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
    step_type   TEXT NOT NULL CHECK (step_type IN ('pdf', 'scenarios', 'video', 'mindmap', 'infographic', 'quiz')),
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
await sql`CREATE INDEX IF NOT EXISTS idx_course_module_batches_batch ON course_module_batches(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_module_batches_module ON course_module_batches(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_mcq_questions_module ON mcq_questions(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_progress_user_module ON assessment_progress(user_email, module_id)`;

await sql`CREATE INDEX IF NOT EXISTS idx_progress_last_accessed ON assessment_progress(last_accessed_at DESC NULLS LAST)`;
await sql`CREATE INDEX IF NOT EXISTS idx_progress_warning_count ON assessment_progress(warning_count DESC) WHERE warning_count > 0`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_progress_last_accessed ON course_progress(last_accessed_at DESC NULLS LAST)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_progress_warning_count ON course_progress(warning_count DESC) WHERE warning_count > 0`;
await sql`CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))`;

// Allow Consumed status on proctor retake approvals (one-time use).
await sql`ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_status_check`;
await sql`
  ALTER TABLE review_requests
  ADD CONSTRAINT review_requests_status_check
  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Consumed'))
`;

// Append-only email event logs (reminders + failed-review guidance + invite/completion history).
await sql`
  CREATE TABLE IF NOT EXISTS training_notification_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id         TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    user_email        TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (
      notification_type IN ('invited', 'completed', 'reminder', 'failed_review_guidance', 'retake_approved')
    ),
    batch_id          TEXT REFERENCES batches(id) ON DELETE SET NULL,
    triggered_by      TEXT,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_training_notification_events_module ON training_notification_events(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_training_notification_events_user ON training_notification_events(LOWER(user_email))`;
await sql`CREATE INDEX IF NOT EXISTS idx_training_notification_events_type_sent ON training_notification_events(notification_type, sent_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS course_notification_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id         TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    user_email        TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (
      notification_type IN ('invited', 'completed', 'reminder', 'failed_review_guidance', 'retake_approved')
    ),
    batch_id          TEXT REFERENCES batches(id) ON DELETE SET NULL,
    triggered_by      TEXT,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_notification_events_module ON course_notification_events(module_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_notification_events_user ON course_notification_events(LOWER(user_email))`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_notification_events_type_sent ON course_notification_events(notification_type, sent_at DESC)`;

// Course Save & Exit — additive only; do NOT backfill existing modules to true.
await sql`
  ALTER TABLE course_modules
  ADD COLUMN IF NOT EXISTS allow_save_exit BOOLEAN NOT NULL DEFAULT FALSE
`;
await sql`
  ALTER TABLE course_progress
  ADD COLUMN IF NOT EXISTS resume_checkpoint JSONB
`;

// Hot-path indexes for analytics / batch marks / email monitoring
await sql`CREATE INDEX IF NOT EXISTS idx_assessment_progress_batch ON assessment_progress(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_progress_batch ON course_progress(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_assessment_progress_batch_status ON assessment_progress(batch_id, status)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_progress_batch_status ON course_progress(batch_id, status)`;
await sql`CREATE INDEX IF NOT EXISTS idx_training_notification_events_batch ON training_notification_events(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_notification_events_batch ON course_notification_events(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_training_notification_events_batch_type ON training_notification_events(batch_id, notification_type)`;
await sql`CREATE INDEX IF NOT EXISTS idx_course_notification_events_batch_type ON course_notification_events(batch_id, notification_type)`;
await sql`CREATE INDEX IF NOT EXISTS idx_users_batch_role ON users(batch_id) WHERE role = 'user'`;

// ─── Multi-batch membership (learners can belong to more than one batch) ─────
await sql`
  CREATE TABLE IF NOT EXISTS user_batches (
    user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    batch_id   TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_email, batch_id)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_user_batches_batch ON user_batches(batch_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_user_batches_email ON user_batches(LOWER(user_email))`;

// Backfill from legacy single users.batch_id
await sql`
  INSERT INTO user_batches (user_email, batch_id)
  SELECT email, batch_id
  FROM users
  WHERE batch_id IS NOT NULL
  ON CONFLICT DO NOTHING
`;

// Progress is owned by (learner × module × batch) so the same course can be
// attempted independently when assigned via different batches.
await sql`
  DO $$
  DECLARE
    cname text;
  BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'course_progress'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%user_email%module_id%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%batch_id%'
    LIMIT 1;
    IF cname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE course_progress DROP CONSTRAINT %I', cname);
    END IF;
  END $$
`;
await sql`
  DO $$
  DECLARE
    cname text;
  BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'assessment_progress'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%user_email%module_id%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%batch_id%'
    LIMIT 1;
    IF cname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE assessment_progress DROP CONSTRAINT %I', cname);
    END IF;
  END $$
`;

// Prefer a real UNIQUE constraint so ON CONFLICT (user_email, module_id, batch_id) works.
await sql`
  UPDATE course_progress cp
  SET batch_id = u.batch_id
  FROM users u
  WHERE LOWER(u.email) = LOWER(cp.user_email)
    AND cp.batch_id IS NULL
    AND u.batch_id IS NOT NULL
`;
await sql`
  UPDATE assessment_progress ap
  SET batch_id = u.batch_id
  FROM users u
  WHERE LOWER(u.email) = LOWER(ap.user_email)
    AND ap.batch_id IS NULL
    AND u.batch_id IS NOT NULL
`;

await sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'course_progress'::regclass
        AND conname = 'course_progress_user_module_batch_key'
    ) THEN
      ALTER TABLE course_progress
        ADD CONSTRAINT course_progress_user_module_batch_key
        UNIQUE (user_email, module_id, batch_id);
    END IF;
  END $$
`;
await sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'assessment_progress'::regclass
        AND conname = 'assessment_progress_user_module_batch_key'
    ) THEN
      ALTER TABLE assessment_progress
        ADD CONSTRAINT assessment_progress_user_module_batch_key
        UNIQUE (user_email, module_id, batch_id);
    END IF;
  END $$
`;

// Recompute stored member counts from multi-batch membership
await sql`
  UPDATE batches b
  SET member_count = COALESCE(ub.c, 0),
      updated_at = NOW()
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

console.log("✅ Schema alterations applied.");

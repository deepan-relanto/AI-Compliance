-- Compliance Agent V2 — Neon PostgreSQL schema
-- Run: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Core org structure ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batches (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0,
  compliance  INTEGER NOT NULL DEFAULT 0,
  pass_rate   INTEGER NOT NULL DEFAULT 0,
  fail_rate   INTEGER NOT NULL DEFAULT 0,
  active_sessions INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  batch_id      TEXT REFERENCES batches(id) ON DELETE SET NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_batch ON users(batch_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ─── Master HR employee directory ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number  TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  work_email       TEXT NOT NULL,
  date_of_birth    DATE,
  gender           TEXT,
  location         TEXT,
  department       TEXT,
  sub_department   TEXT,
  job_title        TEXT,
  reporting_to     TEXT,
  date_joined      DATE,
  worker_type      TEXT,
  primary_skills   TEXT,
  secondary_skills TEXT,
  certifications   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(LOWER(work_email));
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_location ON employees(location);
CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title);
CREATE INDEX IF NOT EXISTS idx_employees_date_joined ON employees(date_joined);
CREATE INDEX IF NOT EXISTS idx_employees_gender ON employees(gender);

-- ─── Training content ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_modules (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  slide_count       INTEGER NOT NULL DEFAULT 1,
  duration_minutes  INTEGER NOT NULL DEFAULT 20,
  content_type      TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'pdf')),
  pdf_url           TEXT,
  feedback_required BOOLEAN NOT NULL DEFAULT FALSE,
  status_default    TEXT NOT NULL DEFAULT 'not_started',
  content_hash          TEXT,
  mcq_generation_status TEXT NOT NULL DEFAULT 'pending',
  module_kind           TEXT NOT NULL DEFAULT 'compliance' CHECK (module_kind IN ('compliance', 'course')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS module_batches (
  module_id TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  batch_id  TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (module_id, batch_id)
);

CREATE TABLE IF NOT EXISTS upload_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name   TEXT NOT NULL,
  pdf_url         TEXT NOT NULL,
  page_count      INTEGER NOT NULL DEFAULT 1,
  file_size_bytes BIGINT,
  uploaded_by     TEXT,
  module_id       TEXT REFERENCES training_modules(id) ON DELETE SET NULL,
  content_hash    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persistent PDF bytes (survives Render redeploys; served via /api/files/uploads)
CREATE TABLE IF NOT EXISTS pdf_storage (
  filename      TEXT PRIMARY KEY,
  pdf_url       TEXT NOT NULL,
  data          BYTEA NOT NULL,
  content_hash  TEXT,
  size_bytes    BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_storage_url ON pdf_storage(pdf_url);

-- ─── Course bundles (multi-step academy content) ─────────────────────────────

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
);

CREATE INDEX IF NOT EXISTS idx_module_steps_module ON module_steps(module_id);

CREATE TABLE IF NOT EXISTS course_assets (
  filename    TEXT PRIMARY KEY,
  asset_url   TEXT NOT NULL UNIQUE,
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_assets_url ON course_assets(asset_url);

-- ─── MCQ checkpoints ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mcq_questions (
  id                TEXT PRIMARY KEY,
  module_id         TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  slide_index       INTEGER NOT NULL,
  prompt            TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcq_options (
  id          TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES mcq_questions(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  PRIMARY KEY (question_id, id)
);

CREATE INDEX IF NOT EXISTS idx_mcq_module_slide ON mcq_questions(module_id, slide_index);

-- ─── Learner progress & integrity ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessment_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          TEXT NOT NULL,
  module_id           TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  module_title        TEXT NOT NULL,
  batch_id            TEXT NOT NULL,
  current_slide       INTEGER NOT NULL DEFAULT 0,
  total_slides        INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed', 'permanently_failed')),
  warning_count       INTEGER NOT NULL DEFAULT 0,
  warning_history     JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived_warnings   JSONB NOT NULL DEFAULT '[]'::jsonb,
  retake_count        INTEGER NOT NULL DEFAULT 0,
  failed_at           TIMESTAMPTZ,
  failed_reason       TEXT,
  last_failure_at     TIMESTAMPTZ,
  last_failure_reason TEXT,
  acknowledgement     JSONB,
  mcq_correct         INTEGER NOT NULL DEFAULT 0,
  mcq_total           INTEGER NOT NULL DEFAULT 0,
  score_percent       INTEGER,
  mcq_answers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_accessed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, module_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON assessment_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_progress_batch ON assessment_progress(batch_id);
CREATE INDEX IF NOT EXISTS idx_progress_module ON assessment_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_progress_status ON assessment_progress(status);
CREATE INDEX IF NOT EXISTS idx_progress_completed_at ON assessment_progress(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON assessment_progress(updated_at);

-- ─── Feedback, reviews, audit ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback_entries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  user_name       TEXT NOT NULL,
  assessment_id   TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  assessment_name TEXT NOT NULL,
  feedback_text   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_assessment ON feedback_entries(assessment_id);

CREATE TABLE IF NOT EXISTS review_requests (
  id                  TEXT PRIMARY KEY,
  username            TEXT NOT NULL,
  module_id           TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  module_title        TEXT NOT NULL,
  warning_count       INTEGER NOT NULL DEFAULT 0,
  failure_timestamp   BIGINT NOT NULL,
  user_explanation    TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Consumed')),
  submitted_timestamp BIGINT NOT NULL,
  decision_timestamp  BIGINT,
  approved_by         TEXT,
  approved_at         BIGINT,
  rejected_by         TEXT,
  rejected_at         BIGINT,
  admin_comment       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_status ON review_requests(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL,
  actor      TEXT NOT NULL,
  details    TEXT,
  timestamp  BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);

-- ─── Live session placeholder (admin live push) ───────────────────────────────

CREATE TABLE IF NOT EXISTS live_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   TEXT REFERENCES batches(id) ON DELETE CASCADE,
  module_id  TEXT REFERENCES training_modules(id) ON DELETE SET NULL,
  user_email TEXT,
  slide_index INTEGER,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Training email notifications ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  user_email        TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('invited', 'completed')),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, user_email, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_training_notifications_module ON training_notifications(module_id);

-- AI Course tables — parallel stack, separate from compliance training_modules / assessment_progress.
-- Run: npm run db:migrate:course

-- ─── Course content ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_modules (
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
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_module_batches (
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  batch_id  TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (module_id, batch_id)
);

CREATE TABLE IF NOT EXISTS course_module_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL,
  step_type   TEXT NOT NULL CHECK (step_type IN ('pdf', 'video', 'mindmap', 'infographic', 'quiz')),
  title       TEXT NOT NULL DEFAULT '',
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, step_order),
  UNIQUE (module_id, step_type)
);

CREATE INDEX IF NOT EXISTS idx_course_module_steps_module ON course_module_steps(module_id);

-- ─── Course MCQ checkpoints ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_mcq_questions (
  id                TEXT PRIMARY KEY,
  module_id         TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  slide_index       INTEGER NOT NULL,
  prompt            TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_mcq_options (
  id          TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES course_mcq_questions(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  PRIMARY KEY (question_id, id)
);

CREATE INDEX IF NOT EXISTS idx_course_mcq_module_slide ON course_mcq_questions(module_id, slide_index);

-- ─── Course learner progress & integrity ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          TEXT NOT NULL,
  module_id           TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_course_progress_batch ON course_progress(batch_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_module ON course_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_status ON course_progress(status);
CREATE INDEX IF NOT EXISTS idx_course_progress_completed_at ON course_progress(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_progress_updated_at ON course_progress(updated_at);

-- ─── Course feedback, reviews, audit ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_feedback_entries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  user_name       TEXT NOT NULL,
  assessment_id   TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  assessment_name TEXT NOT NULL,
  feedback_text   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_feedback_assessment ON course_feedback_entries(assessment_id);

CREATE TABLE IF NOT EXISTS course_review_requests (
  id                  TEXT PRIMARY KEY,
  username            TEXT NOT NULL,
  module_id           TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_course_review_status ON course_review_requests(status);

CREATE TABLE IF NOT EXISTS course_audit_logs (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL,
  actor      TEXT NOT NULL,
  details    TEXT,
  module_id  TEXT,
  timestamp  BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_audit_timestamp ON course_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_course_audit_module ON course_audit_logs(module_id);

-- ─── Course email notifications ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  user_email        TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('invited', 'completed')),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, user_email, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_course_notifications_module ON course_notifications(module_id);

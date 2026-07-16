-- TTS sandbox tables
-- Purpose: isolated copies of course bundles for narration / avatar work
-- without touching the live course_* records.

CREATE TABLE IF NOT EXISTS tts_course_modules (
  id                TEXT PRIMARY KEY,
  source_module_id  TEXT NOT NULL REFERENCES course_modules(id) ON DELETE RESTRICT,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  slide_count       INTEGER NOT NULL DEFAULT 1,
  duration_minutes  INTEGER NOT NULL DEFAULT 20,
  content_type      TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'pdf')),
  pdf_url           TEXT,
  feedback_required BOOLEAN NOT NULL DEFAULT FALSE,
  status_default    TEXT NOT NULL DEFAULT 'not_started',
  content_hash      TEXT,
  mcq_generation_status TEXT NOT NULL DEFAULT 'completed',
  tts_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  script_status     TEXT NOT NULL DEFAULT 'not_started'
    CHECK (script_status IN ('not_started', 'generating', 'generated', 'reviewed', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_course_modules_source ON tts_course_modules(source_module_id);

CREATE TABLE IF NOT EXISTS tts_course_module_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   TEXT NOT NULL REFERENCES tts_course_modules(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL,
  step_type   TEXT NOT NULL CHECK (step_type IN ('pdf', 'scenarios', 'video', 'mindmap', 'infographic', 'quiz')),
  title       TEXT NOT NULL DEFAULT '',
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, step_order),
  UNIQUE (module_id, step_type)
);

CREATE INDEX IF NOT EXISTS idx_tts_course_module_steps_module ON tts_course_module_steps(module_id);

CREATE TABLE IF NOT EXISTS tts_course_mcq_questions (
  id                TEXT PRIMARY KEY,
  module_id         TEXT NOT NULL REFERENCES tts_course_modules(id) ON DELETE CASCADE,
  slide_index       INTEGER NOT NULL,
  prompt            TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_course_mcq_module_slide ON tts_course_mcq_questions(module_id, slide_index);

CREATE TABLE IF NOT EXISTS tts_course_mcq_options (
  id          TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES tts_course_mcq_questions(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  PRIMARY KEY (question_id, id)
);

CREATE TABLE IF NOT EXISTS tts_course_script_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id       TEXT NOT NULL REFERENCES tts_course_modules(id) ON DELETE CASCADE,
  source_step_type TEXT NOT NULL CHECK (source_step_type IN ('pdf', 'scenarios', 'video', 'mindmap', 'infographic', 'quiz')),
  step_order      INTEGER NOT NULL,
  beat_key        TEXT NOT NULL,
  slide_index     INTEGER NOT NULL DEFAULT 0,
  fragment_index  INTEGER NOT NULL DEFAULT 0,
  slide_title     TEXT,
  raw_text        TEXT NOT NULL DEFAULT '',
  script_text     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, beat_key)
);

CREATE INDEX IF NOT EXISTS idx_tts_course_script_segments_module
  ON tts_course_script_segments(module_id);

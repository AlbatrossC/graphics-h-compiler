-- Graphics.h AI Assistant — D1 Schema
-- Run: wrangler d1 execute graphicsh-ai --remote --file=schema.sql

-- ═══════════════════════════════════════
-- Table 1: guest_info
-- One row per guest visitor
-- Rate limiting via sliding window (separate windows for AI chat and Fix-with-AI)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS guest_info (
  id TEXT PRIMARY KEY,
  fingerprint_id TEXT NOT NULL UNIQUE,
  total_requests INTEGER NOT NULL DEFAULT 0,
  window_requests INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  last_request_at TEXT,
  fix_window_requests INTEGER NOT NULL DEFAULT 0,
  fix_window_start TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gi_fp ON guest_info(fingerprint_id);

-- ═══════════════════════════════════════
-- Table 2: guest_logs
-- One row per guest request
-- No filename sent to guest, but stored for analytics
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS guest_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  fingerprint_id TEXT NOT NULL,
  version TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('new', 'edit', 'error')),
  user_query TEXT NOT NULL,
  generated_code TEXT NOT NULL,
  generated_filename TEXT NOT NULL,
  chat_response TEXT NOT NULL,
  error_message TEXT,
  fix_attempt INTEGER NOT NULL DEFAULT 0,
  user_action TEXT CHECK(user_action IN ('apply', 'reject', 'force_apply')),
  api_key_used TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gl_session ON guest_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_gl_fp ON guest_logs(fingerprint_id);

-- ═══════════════════════════════════════
-- Table 3: logged_users
-- One row per signed-in user
-- Rate limiting via sliding window (separate windows for AI chat and Fix-with-AI)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS logged_users (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  user_name TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  window_requests INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  last_request_at TEXT,
  fix_window_requests INTEGER NOT NULL DEFAULT 0,
  fix_window_start TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lu_email ON logged_users(user_email);

-- ═══════════════════════════════════════
-- Table 4: logged_sessions
-- One row per logged-in user request
-- Sessions + chat history + generated code + filename
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS logged_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_title TEXT,
  version TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('new', 'edit', 'error')),
  user_query TEXT NOT NULL,
  generated_code TEXT NOT NULL,
  generated_filename TEXT NOT NULL,
  chat_response TEXT NOT NULL,
  error_message TEXT,
  fix_attempt INTEGER NOT NULL DEFAULT 0,
  user_action TEXT CHECK(user_action IN ('apply', 'reject', 'force_apply')),
  api_key_used TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ls_email ON logged_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_ls_session ON logged_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ls_email_session ON logged_sessions(user_email, session_id);

-- ═══════════════════════════════════════
-- Table 5: daily_usage
-- One row per day, platform-wide analytics
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_usage (
  date TEXT PRIMARY KEY,
  total_requests INTEGER NOT NULL DEFAULT 0,
  guest_requests INTEGER NOT NULL DEFAULT 0,
  user_requests INTEGER NOT NULL DEFAULT 0,
  error_requests INTEGER NOT NULL DEFAULT 0,
  primary_key_calls INTEGER NOT NULL DEFAULT 0,
  secondary_key_calls INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  unique_guests INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT
);

-- ═══════════════════════════════════════
-- Table 6: fixes
-- One row per Fix-with-AI button request
-- Tracks editor_code, error, fixed_code, and attempt number
-- fingerprint_id is set for guests, user_email for logged-in users
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS fixes (
  id TEXT PRIMARY KEY,
  fingerprint_id TEXT,
  user_email TEXT,
  editor_code TEXT NOT NULL,
  error TEXT NOT NULL,
  fixed_code TEXT NOT NULL,
  fix_attempt INTEGER NOT NULL DEFAULT 1,
  api_key_used TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fixes_fp ON fixes(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_fixes_email ON fixes(user_email);

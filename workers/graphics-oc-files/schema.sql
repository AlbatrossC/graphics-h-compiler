-- =====================================================
-- Database: graphicsh_oc_db
-- Purpose: Storage for Graphics.h Online Compiler
-- Tables:
--   users
--   folders
--   files
-- =====================================================


-- =====================================================
-- USERS TABLE
-- Stores user metadata and moderation flags
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
  sr_no INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  first_sign_in INTEGER,
  last_sign_in INTEGER,
  total_files INTEGER DEFAULT 0,
  total_storage INTEGER DEFAULT 0,
  write_blocked INTEGER DEFAULT 0,
  last_active_at INTEGER,
  last_opened_file_id TEXT
);


-- Index for quick user lookup
CREATE INDEX IF NOT EXISTS idx_users_user_id
ON users(user_id);

-- Enforce one account per email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
ON users(lower(email));



-- =====================================================
-- FOLDERS TABLE
-- Each user can create multiple folders
-- =====================================================

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_name TEXT NOT NULL
);


-- Fast lookup of folders for a user
CREATE INDEX IF NOT EXISTS idx_folders_user_id
ON folders(user_id);


-- Prevent duplicate folder names for same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_folder
ON folders(user_id, folder_name);



-- =====================================================
-- FILES TABLE
-- Stores code files.
-- NOTE: content_hash (SHA-256 hex) MUST be returned by
--       every GET /api/files response so the frontend can
--       detect duplicate guest code at sign-in without a
--       separate API call. Populated on every save.
-- =====================================================

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_id TEXT,
  file_name TEXT NOT NULL,
  file_content TEXT,
  file_size INTEGER,
  content_hash TEXT,
  created_at INTEGER,
  updated_at INTEGER
);


-- Fast lookup of files by user
CREATE INDEX IF NOT EXISTS idx_files_user_id
ON files(user_id);


-- Fast lookup of files by folder
CREATE INDEX IF NOT EXISTS idx_files_folder_id
ON files(folder_id);


-- Fast lookup by hash (used for duplicate detection at sign-in)
CREATE INDEX IF NOT EXISTS idx_files_content_hash
ON files(content_hash)
WHERE content_hash IS NOT NULL;


-- Prevent duplicate file names inside the same non-root folder
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_file_in_folder
ON files(user_id, folder_id, file_name)
WHERE folder_id IS NOT NULL;

-- Prevent duplicate root-level file names per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_root_file
ON files(user_id, file_name)
WHERE folder_id IS NULL;


-- =====================================================
-- LOGIN HISTORY TABLE
-- Tracks user sign-in events
-- =====================================================

CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  login_at INTEGER NOT NULL,
  ip_address TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id
ON login_history(user_id);

CREATE INDEX IF NOT EXISTS idx_login_history_login_at
ON login_history(login_at);


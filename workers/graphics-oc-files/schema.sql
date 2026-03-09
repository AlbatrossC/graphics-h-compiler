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

  first_sign_in INTEGER,
  last_sign_in INTEGER,

  total_files INTEGER DEFAULT 0,
  total_storage INTEGER DEFAULT 0,

  write_blocked INTEGER DEFAULT 0
);


-- Index for quick user lookup
CREATE INDEX IF NOT EXISTS idx_users_user_id
ON users(user_id);



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
-- Stores code files
-- =====================================================

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL,

  folder_id TEXT,

  file_name TEXT NOT NULL,

  file_content TEXT,

  file_size INTEGER,

  content_hash TEXT
);


-- Fast lookup of files by user
CREATE INDEX IF NOT EXISTS idx_files_user_id
ON files(user_id);


-- Fast lookup of files by folder
CREATE INDEX IF NOT EXISTS idx_files_folder_id
ON files(folder_id);


-- Prevent duplicate file names inside a folder
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_file_in_folder
ON files(user_id, folder_id, file_name);
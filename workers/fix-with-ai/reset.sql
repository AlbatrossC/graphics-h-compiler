DROP TABLE IF EXISTS fix_jobs;

CREATE TABLE IF NOT EXISTS fix_jobs (
  job_id TEXT PRIMARY KEY,
  identifier_type TEXT NOT NULL CHECK(identifier_type IN ('email', 'fingerprint')),
  identifier_value TEXT NOT NULL,
  code TEXT NOT NULL,
  error TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'done', 'failed')),
  explanation TEXT,
  fixed_code TEXT,
  api_key_used TEXT CHECK(api_key_used IN ('primary', 'secondary')),
  gemini_try_count INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL,
  failure_reason TEXT,
  request_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fix_jobs_identifier_date
  ON fix_jobs(identifier_type, identifier_value, request_date);

CREATE INDEX IF NOT EXISTS idx_fix_jobs_hash_lookup
  ON fix_jobs(identifier_type, identifier_value, hash, status);

CREATE INDEX IF NOT EXISTS idx_fix_jobs_status_created
  ON fix_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_fix_jobs_key_used
  ON fix_jobs(api_key_used, request_date, status);

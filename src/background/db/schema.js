export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  source_id        TEXT NOT NULL,

  title            TEXT NOT NULL,
  company          TEXT,
  location         TEXT,
  remote           INTEGER,        -- 0/1/NULL, SQLite has no native boolean  
  description      TEXT,
  employment_type  TEXT,

  salary_min       REAL,
  salary_max       REAL,
  salary_currency  TEXT,

  url              TEXT NOT NULL,
  posted_at        TEXT,
  fetched_at       TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'new',

  filtered_out_at  TEXT,
  shortlisted_at   TEXT,
  applied_at       TEXT,

  raw              TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at);
CREATE INDEX IF NOT EXISTS idx_jobs_applied_at ON jobs(applied_at);
`;
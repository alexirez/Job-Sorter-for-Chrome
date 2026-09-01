export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  sourceId         TEXT NOT NULL,

  title            TEXT NOT NULL,
  company          TEXT,
  location         TEXT,
  remote           INTEGER,        -- 0/1/NULL, SQLite has no native boolean  
  description      TEXT,
  employmentType   TEXT,

  salaryMin        REAL,
  salaryMax        REAL,
  salaryCurrency   TEXT,

  url              TEXT NOT NULL,
  postedAt         TEXT,
  fetchedAt        TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'new',

  filteredOutAt    TEXT,
  shortlistedAt    TEXT,
  appliedAt        TEXT,

  raw              TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(postedAt);
CREATE INDEX IF NOT EXISTS idx_jobs_applied_at ON jobs(appliedAt);
`;
export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  sourceId         TEXT NOT NULL,

  title            TEXT NOT NULL,
  company          TEXT,
  location         TEXT,
  workType         INTEGER,        -- 0=unknown 1=onsite 2=remote 3=hybrid
  description      TEXT,
  employmentType   TEXT,

  minSalary        REAL,           -- annual, as given by the source
  maxSalary        REAL,
  minHourly        REAL,
  maxHourly        REAL,
  currency         TEXT,

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
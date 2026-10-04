// Single column list: both tables are built from it so they can't drift apart.
const JOB_COLUMNS = [
  ['id',             'TEXT PRIMARY KEY'],
  ['source',         'TEXT NOT NULL'],
  ['sourceId',       'TEXT NOT NULL'],

  ['title',          'TEXT NOT NULL'],
  ['company',        'TEXT'],
  ['location',       'TEXT'],
  ['workType',       'INTEGER'],   // 0=unknown 1=onsite 2=remote 3=hybrid
  ['description',    'TEXT'],
  ['employmentType', 'TEXT'],

  ['minSalary',      'REAL'],      // annual, as given by the source
  ['maxSalary',      'REAL'],
  ['minHourly',      'REAL'],
  ['maxHourly',      'REAL'],
  ['currency',       'TEXT'],

  ['url',            'TEXT NOT NULL'],
  ['postedAt',       'TEXT'],
  ['fetchedAt',      'TEXT NOT NULL'],

  ['status',         "TEXT NOT NULL DEFAULT 'new'"],

  ['filteredOutAt',  'TEXT'],
  ['shortlistedAt',  'TEXT'],
  ['appliedAt',      'TEXT'],

  ['raw',            'TEXT']
];

// Explicit column list for the archive/restore moves (INSERT ... SELECT).
export const JOB_COLUMN_NAMES = JOB_COLUMNS.map(([name]) => name);

const defs = (extra = '') =>
  JOB_COLUMNS.map(([name, type]) => `  ${name} ${type}`).join(',\n') + extra;

const indexesFor = (table, p) => `
CREATE INDEX IF NOT EXISTS idx_${p}_source_status ON ${table}(source, status);
CREATE INDEX IF NOT EXISTS idx_${p}_status_posted ON ${table}(status, postedAt);
CREATE INDEX IF NOT EXISTS idx_${p}_posted_at     ON ${table}(postedAt);
CREATE INDEX IF NOT EXISTS idx_${p}_applied       ON ${table}(appliedAt) WHERE appliedAt IS NOT NULL;
`;

export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS jobs (
${defs()}
);

-- Replaced by the composite / partial indexes below.
DROP INDEX IF EXISTS idx_jobs_status;
DROP INDEX IF EXISTS idx_jobs_source;
DROP INDEX IF EXISTS idx_jobs_applied_at;
${indexesFor('jobs', 'jobs')}
`;

export const CREATE_ARCHIVED_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS archived_jobs (
${defs(',\n  archivedAt TEXT NOT NULL')}
);
${indexesFor('archived_jobs', 'arch')}
CREATE INDEX IF NOT EXISTS idx_arch_archived_at ON archived_jobs(archivedAt);
`;
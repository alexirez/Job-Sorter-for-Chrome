import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import { CREATE_JOBS_TABLE } from './schema.js';

let sqlite3 = null;
let db = null;

/** Call once, before any query. Safe to call multiple times (no-ops after first). */
export async function initDB() {
  if (db) return db;

  const module = await SQLiteESMFactory();
  sqlite3 = SQLite.Factory(module);

  const vfs = new AccessHandlePoolVFS('/job-sorter-vfs');
  await vfs.isReady;
  sqlite3.vfs_register(vfs, true);

  db = await sqlite3.open_v2('jobs.db');
  await sqlite3.exec(db, CREATE_JOBS_TABLE);

  return db;
}

/**
 * Insert a job, or update it if the id already exists (dedup by source:sourceId).
 * @param {import('../../sources/types.js').NormalizedJob} job
 */
export async function upsertJob(job) {
  await initDB();

  const sql = `
    INSERT INTO jobs (
      id, source, source_id, title, company, location, remote, description,
      employment_type, salary_min, salary_max, salary_currency, url, posted_at,
      fetched_at, status, filtered_out_at, shortlisted_at, applied_at, raw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      fetched_at = excluded.fetched_at,
      raw = excluded.raw;
  `;

  const params = [
    job.id, job.source, job.sourceId, job.title, job.company, job.location,
    job.remote === null ? null : job.remote ? 1 : 0,
    job.description, job.employmentType, job.salaryMin, job.salaryMax,
    job.salaryCurrency, job.url, job.postedAt, job.fetchedAt, job.status,
    job.filteredOutAt, job.shortlistedAt, job.appliedAt, job.raw
  ];

  await sqlite3.exec(db, sql, params);
}

/** @returns {Promise<import('../../sources/types.js').NormalizedJob[]>} */
export async function getJobsByStatus(status) {
  await initDB();
  const rows = [];
  await sqlite3.exec(db, 'SELECT * FROM jobs WHERE status = ?', [status], (row, columns) => {
    rows.push(rowToJob(row, columns));
  });
  return rows;
}

/** Moves a job to a new status and stamps the matching timestamp column. */
export async function updateJobStatus(id, newStatus) {
  await initDB();
  const now = new Date().toISOString();

  const timestampColumn = {
    filtered_out: 'filtered_out_at',
    shortlisted: 'shortlisted_at',
    applied: 'applied_at'
  }[newStatus];

  const sql = timestampColumn
    ? `UPDATE jobs SET status = ?, ${timestampColumn} = ? WHERE id = ? AND ${timestampColumn} IS NULL`
    : `UPDATE jobs SET status = ? WHERE id = ?`;

  const params = timestampColumn ? [newStatus, now, id] : [newStatus, id];
  await sqlite3.exec(db, sql, params);
}

function rowToJob(row, columns) {
  const obj = Object.fromEntries(columns.map((col, i) => [col, row[i]]));
  return {
    ...obj,
    remote: obj.remote === null ? null : !!obj.remote
  };
}
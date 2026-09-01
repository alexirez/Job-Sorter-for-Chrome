import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import { CREATE_JOBS_TABLE } from './schema.js';

let sqlite3 = null;
let db = null;

async function initDB() {
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

async function upsertJob(job) {
  await initDB();
  const sql = `
    INSERT INTO jobs (
      id, source, sourceId, title, company, location, remote, description,
      employmentType, salaryMin, salaryMax, salaryCurrency, url, postedAt,
      fetchedAt, status, filteredOutAt, shortlistedAt, appliedAt, raw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      fetchedAt = excluded.fetchedAt,
      raw = excluded.raw;
  `;
  const params = [
    job.id, job.source, job.sourceId, job.title, job.company, job.location,
    job.remote === null ? null : job.remote ? 1 : 0,
    job.description, job.employmentType, job.salaryMin, job.salaryMax,
    job.salaryCurrency, job.url, job.postedAt, job.fetchedAt, job.status,
    job.filteredOutAt, job.shortlistedAt, job.appliedAt, job.raw
  ];
  await sqlite3.run(db, sql, params);
  return { success: true };
}

function toJob(row, columns) {
  const obj = Object.fromEntries(columns.map((col, i) => [col, row[i]]));
  return { ...obj, remote: obj.remote === null ? null : !!obj.remote };
}

async function getJobsByStatus(status) {
  await initDB();
  const { rows, columns } = await sqlite3.execWithParams(db, 'SELECT * FROM jobs WHERE status = ?', [status]);
  return rows.map((row) => toJob(row, columns));
}

async function getAllJobs() {
  await initDB();
  const { rows, columns } = await sqlite3.execWithParams(db, 'SELECT * FROM jobs', []);
  return rows.map((row) => toJob(row, columns));
}

async function updateJobStatus(id, newStatus) {
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
  await sqlite3.run(db, sql, params);
  return { success: true };
}

const handlers = { upsertJob, getJobsByStatus, updateJobStatus, getAllJobs };

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  const fn = handlers[type.replace('db:', '')];
  try {
    const result = fn ? await fn(payload) : (() => { throw new Error(`Unknown db command: ${type}`); })();
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
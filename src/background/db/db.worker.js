import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import { CREATE_JOBS_TABLE, CREATE_ARCHIVED_JOBS_TABLE, JOB_COLUMN_NAMES } from './schema.js';

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
  await sqlite3.exec(db, CREATE_ARCHIVED_JOBS_TABLE);
  return db;
}

// Wipes database if ever needed, via Help modal.
async function resetDatabase() {
  await initDB();
  await sqlite3.exec(db, 'DROP TABLE IF EXISTS jobs;');
  await sqlite3.exec(db, CREATE_JOBS_TABLE);
  return { success: true };
}

async function upsertJob(job) {
  await initDB();
  const sql = `
    INSERT INTO jobs (
      id, source, sourceId, title, company, location, workType, description,
      employmentType, minSalary, maxSalary, minHourly, maxHourly, currency,
      url, postedAt, fetchedAt, status, filteredOutAt, shortlistedAt, appliedAt, raw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      fetchedAt = excluded.fetchedAt,
      raw = excluded.raw;
  `;
  const params = [
    job.id, job.source, job.sourceId, job.title, job.company, job.location,
    job.workType ?? null,
    job.description, job.employmentType,
    job.minSalary, job.maxSalary, job.minHourly, job.maxHourly, job.currency,
    job.url, job.postedAt, job.fetchedAt, job.status,
    job.filteredOutAt, job.shortlistedAt, job.appliedAt, job.raw
  ];
  await sqlite3.run(db, sql, params);
  return { success: true };
}

function toJob(row, columns) {
  return Object.fromEntries(columns.map((col, i) => [col, row[i]]));
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

const COLS = JOB_COLUMN_NAMES.join(', ');
const CHUNK = 500; // keeps each statement well under SQLite's bound-variable limit
const marks = (n) => Array(n).fill('?').join(',');

async function inTransaction(fn) {
  await sqlite3.exec(db, 'BEGIN');
  try {
    const result = await fn();
    await sqlite3.exec(db, 'COMMIT');
    return result;
  } catch (err) {
    await sqlite3.exec(db, 'ROLLBACK');
    throw err;
  }
}

async function getArchivedJobs() {
  await initDB();
  const { rows, columns } = await sqlite3.execWithParams(db, 'SELECT * FROM archived_jobs ORDER BY archivedAt DESC', []);
  return rows.map((row) => toJob(row, columns));
}

// Archive = move jobs -> archived_jobs. One transaction, so a posting is never in both tables or neither.
// INSERT OR REPLACE so an id that already exists in the target (e.g. re-fetched after archiving) can't abort the move.
async function archiveJobs({ ids }) {
  await initDB();
  const now = new Date().toISOString();
  await inTransaction(async () => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await sqlite3.run(db,
        `INSERT OR REPLACE INTO archived_jobs (${COLS}, archivedAt) SELECT ${COLS}, ? FROM jobs WHERE id IN (${marks(chunk.length)})`,
        [now, ...chunk]);
      await sqlite3.run(db, `DELETE FROM jobs WHERE id IN (${marks(chunk.length)})`, chunk);
    }
  });
  return { success: true };
}

async function restoreJobs({ ids }) {
  await initDB();
  await inTransaction(async () => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await sqlite3.run(db,
        `INSERT OR REPLACE INTO jobs (${COLS}) SELECT ${COLS} FROM archived_jobs WHERE id IN (${marks(chunk.length)})`,
        chunk);
      await sqlite3.run(db, `DELETE FROM archived_jobs WHERE id IN (${marks(chunk.length)})`, chunk);
    }
  });
  return { success: true };
}

async function deleteJobs({ ids, fromArchive }) {
  await initDB();
  const table = fromArchive ? 'archived_jobs' : 'jobs'; // fixed whitelist, never user input
  await inTransaction(async () => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await sqlite3.run(db, `DELETE FROM ${table} WHERE id IN (${marks(chunk.length)})`, chunk);
    }
  });
  return { success: true };
}

async function updateJobStatus(id, newStatus) {
  await initDB();
  const now = new Date().toISOString();
  const timestampColumn = {
    filtered_out: 'filteredOutAt',
    shortlisted: 'shortlistedAt',
    applied: 'appliedAt'
  }[newStatus];
  const sql = timestampColumn
    ? `UPDATE jobs SET status = ?, ${timestampColumn} = COALESCE(${timestampColumn}, ?) WHERE id = ?`
    : `UPDATE jobs SET status = ? WHERE id = ?`;
  const params = timestampColumn ? [newStatus, now, id] : [newStatus, id];
  await sqlite3.run(db, sql, params);
  return { success: true };
}

const handlers = {
  upsertJob, getJobsByStatus, updateJobStatus, getAllJobs, resetDatabase,
  getArchivedJobs, archiveJobs, restoreJobs, deleteJobs
};

// Commands run strictly one at a time, so a fetch's upsertJob can't land in the middle of an archive transaction.
let queue = Promise.resolve();
self.onmessage = (event) => {
  const { id, type, payload } = event.data;
  queue = queue.then(async () => {
    const fn = handlers[type.replace('db:', '')];
    try {
      if (!fn) throw new Error(`Unknown db command: ${type}`);
      self.postMessage({ id, result: await fn(payload) });
    } catch (err) {
      self.postMessage({ id, error: err.message });
    }
  });
};
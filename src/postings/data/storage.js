// Persistence for the extension page.
// - Settings, prefs, personal info and resume metadata live in chrome.storage.local
//   (NOT sync: tokens are secrets and shouldn't leave the device).
// - Resume files live in IndexedDB, since chrome.storage can't hold binary well.
// - Loaded data is merged over fresh defaults, so keys added in future versions
//   never come back undefined for existing users.

const PREFIX = 'js:';
const timers = new Map();
const pending = new Map();

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Keep saved values where the shape matches the defaults; fall back to defaults otherwise.
// Arrays are taken whole from saved data. Keys no longer in defaults are dropped.
function merge(defaults, saved) {
  if (!isObj(defaults)) return typeof saved === typeof defaults && saved !== undefined ? saved : defaults;
  if (!isObj(saved)) return defaults;
  const out = {};
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const s = saved[key];
    if (Array.isArray(d)) out[key] = Array.isArray(s) ? s : d;
    else if (isObj(d)) out[key] = merge(d, s);
    else out[key] = typeof s === typeof d ? s : d;
  }
  return out;
}

export async function load(name, defaults) {
  try {
    const key = PREFIX + name;
    const result = await chrome.storage.local.get(key);
    const saved = result[key];
    if (saved === undefined) return defaults;
    return Array.isArray(defaults) ? (Array.isArray(saved) ? saved : defaults) : merge(defaults, saved);
  } catch (err) {
    console.error(`storage.load(${name}) failed`, err);
    return defaults;
  }
}

export async function save(name, value) {
  try {
    await chrome.storage.local.set({ [PREFIX + name]: value });
  } catch (err) {
    console.error(`storage.save(${name}) failed`, err);
  }
}

// Debounced save for text inputs, so typing doesn't write on every keystroke.
export function saveSoon(name, value, delay = 400) {
  clearTimeout(timers.get(name));
  pending.set(name, value);
  timers.set(name, setTimeout(() => { timers.delete(name); pending.delete(name); save(name, value); }, delay));

}

// Write anything still waiting on the debounce (call on pagehide).
export function flush() {
  for (const [name, value] of pending) {
    clearTimeout(timers.get(name));
    timers.delete(name);
    save(name, value);
  }
  pending.clear();
}

export async function remove(...names) {
  names.forEach((n) => { clearTimeout(timers.get(n)); timers.delete(n); pending.delete(n); });
  await chrome.storage.local.remove(names.map((n) => PREFIX + n));
}

// ---- Resume files (IndexedDB) ----
const DB_NAME = 'job-sorter';
const STORE = 'resume-files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const putResumeFile = (id, file) => withStore('readwrite', (s) => s.put(file, id));
export const getResumeFile = (id) => withStore('readonly', (s) => s.get(id));
export const deleteResumeFile = (id) => withStore('readwrite', (s) => s.delete(id));
export const clearResumeFiles = () => withStore('readwrite', (s) => s.clear());
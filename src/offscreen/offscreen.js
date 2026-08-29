const worker = new Worker(new URL('../background/db/db.worker.js', import.meta.url), { type: 'module' });

const pending = new Map();
let nextId = 0;

worker.onmessage = (event) => {
  const { id, result, error } = event.data;
  const resolver = pending.get(id);
  if (!resolver) return;
  pending.delete(id);
  error ? resolver.reject(new Error(error)) : resolver.resolve(result);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type?.startsWith('db:')) return; // not ours, ignore

  const id = nextId++;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));

  worker.postMessage({ id, type: message.type, payload: message.payload });

  promise
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true; // keep the message channel open for the async response
});
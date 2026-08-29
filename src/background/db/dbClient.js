let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('src/offscreen/offscreen.html')]
  });
  if (existing.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Runs wa-sqlite in a Dedicated Worker for OPFS-backed job storage'
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

async function callDb(type, payload) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ type: `db:${type}`, payload });
  if (!response.ok) throw new Error(response.error);
  return response.result;
}

export const upsertJob = (job) => callDb('upsertJob', job);
export const getJobsByStatus = (status) => callDb('getJobsByStatus', status);
export const updateJobStatus = (id, newStatus) => callDb('updateJobStatus', { id, newStatus });
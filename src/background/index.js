import {
  getAllJobs, getArchivedJobs, archiveJobs, restoreJobs, deleteJobs, resetDatabase
} from './db/dbClient.js';

// // temporary test

// async function testPipeline() {
//   const jobs = await fetchJobs({
//     country: 'us',
//     keywords: 'frontend',
//     location: 'Los Angeles',
//     desiredCount: 50
//   });

//   console.log('Fetched + normalized:', jobs);

//   for (const job of jobs) {
//     await upsertJob(job);
//   }

//   const stored = await getJobsByStatus('new');
//   console.log('Read back from SQLite:', stored);
// }

// testPipeline().catch(err => console.error('Pipeline test failed:', err));


// // endtest




// Each route returns the extra fields to merge into { ok: true, ... }.
const routes = {
  'postings:getAllJobs':      () => getAllJobs().then((jobs) => ({ jobs })),
  'postings:getArchivedJobs': () => getArchivedJobs().then((jobs) => ({ jobs })),
  'postings:archiveJobs':     (m) => archiveJobs(m.ids).then(() => ({})),
  'postings:restoreJobs':     (m) => restoreJobs(m.ids).then(() => ({})),
  'postings:deleteJobs':      (m) => deleteJobs(m.ids, m.fromArchive).then(() => ({})),
  'postings:wipeJobs':        () => resetDatabase().then(() => ({}))
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const route = routes[message?.type];
  if (!route) return; // not ours
  route(message)
    .then((extra) => sendResponse({ ok: true, ...extra }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
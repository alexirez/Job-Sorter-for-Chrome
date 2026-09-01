
// temporary test
import { fetchJobs } from '../sources/adzuna.js';
import { upsertJob, getJobsByStatus } from './db/dbClient.js';

async function testPipeline() {
  const jobs = await fetchJobs({
    country: 'us',
    keywords: 'frontend developer',
    location: 'Los Angeles',
    desiredCount: 50
  });

  console.log('Fetched + normalized:', jobs);

  for (const job of jobs) {
    await upsertJob(job);
  }

  const stored = await getJobsByStatus('new');
  console.log('Read back from SQLite:', stored);
}

testPipeline().catch(err => console.error('Pipeline test failed:', err));

import { getAllJobs } from './db/dbClient.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'postings:getAllJobs') return;

  getAllJobs()
    .then((jobs) => sendResponse({ ok: true, jobs }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true; // keep the message channel open for the async response
});
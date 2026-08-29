// temporary test

import { fetchJobs } from '../sources/adzuna.js';
import { upsertJob, getJobsByStatus } from './db/dbClient.js';

async function testPipeline() {
  const jobs = await fetchJobs({
    country: 'us',
    keywords: 'frontend developer',
    location: 'Los Angeles',
    desiredCount: 3
  });

  console.log('Fetched + normalized:', jobs);

  for (const job of jobs) {
    await upsertJob(job);
  }

  const stored = await getJobsByStatus('new');
  console.log('Read back from SQLite:', stored);
}

testPipeline().catch(err => console.error('Pipeline test failed:', err));
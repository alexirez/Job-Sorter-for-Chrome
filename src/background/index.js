// temporary test

import { fetchJobs } from '../sources/adzuna.js';

fetchJobs({
  country: 'us',
  keywords: 'frontend developer',
  location: 'Los Angeles',
  desiredCount: 3
})
  .then(jobs => console.log('Adzuna results:', jobs))
  .catch(err => console.error('Adzuna fetch failed:', err));
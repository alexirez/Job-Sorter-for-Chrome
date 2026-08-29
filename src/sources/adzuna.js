import { buildJobId, JOB_STATUS } from './types.js';

const ADZUNA_APP_ID = import.meta.env.VITE_ADZUNA_APP_ID;
const ADZUNA_APP_KEY = import.meta.env.VITE_ADZUNA_APP_KEY;
const BASE_URL = 'https://api.adzuna.com/v1/api/jobs';

/**
 * Converts one raw Adzuna result into NormalizedJob shape.
 * @returns {import('./types.js').NormalizedJob}
 */
function normalizeAdzunaJob(raw) {
  const now = new Date().toISOString();

  return {
    id: buildJobId('adzuna', raw.id),
    source: 'adzuna',
    sourceId: raw.id,

    title: raw.title,
    company: raw.company?.display_name ?? null,
    location: raw.location?.display_name ?? null,
    remote: null, // Adzuna doesn't expose this explicitly
    description: raw.description ?? null, // excerpt, not full text
    employmentType: raw.contract_time ?? null, // e.g. "full_time", often missing

    salaryMin: raw.salary_min ?? null,
    salaryMax: raw.salary_max ?? null,
    salaryCurrency: raw.salary_min != null ? 'USD' : null, // Adzuna doesn't return currency explicitly; adjust if you query non-US

    url: raw.redirect_url,
    postedAt: raw.created ?? null,
    fetchedAt: now,

    status: JOB_STATUS.NEW,
    filteredOutAt: null,
    shortlistedAt: null,
    appliedAt: null,

    raw: JSON.stringify(raw)
  };
}

/**
 * Fetch a single page of postings (max 50 per Adzuna's limit).
 */
async function fetchJobsPage({ country = 'us', keywords, location, page = 1, resultsPerPage = 50 }) {
  const params = new URLSearchParams({
    app_id: ADZUNA_APP_ID,
    app_key: ADZUNA_APP_KEY,
    results_per_page: resultsPerPage,
    what: keywords,
    where: location,
    sort_by: 'date',
    max_days_old: '14',
    'content-type': 'application/json'
  });

  const url = `${BASE_URL}/${country}/search/${page}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Adzuna API error: ${res.status} ${res.statusText}`);
  }

  return res.json(); // { count, results: [...], ... }
}

/**
 * Fetch up to `desiredCount` postings by paging (50 per call).
 */
export async function fetchJobs({ country, keywords, location, desiredCount = 50 }) {
  const perPage = 50;
  const pagesNeeded = Math.ceil(desiredCount / perPage);
  let allResults = [];

  for (let page = 1; page <= pagesNeeded; page++) {
    const data = await fetchJobsPage({
      country,
      keywords,
      location,
      page,
      resultsPerPage: perPage
    });

    allResults = allResults.concat(data.results);

    if (allResults.length >= data.count) break;
  }

  return allResults.slice(0, desiredCount).map(normalizeAdzunaJob);
}
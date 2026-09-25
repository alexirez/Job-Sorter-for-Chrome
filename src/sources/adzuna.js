import { buildJobId, JOB_STATUS } from './types.js';
import { WORK_TYPE } from '../shared/workType.js';

const ADZUNA_APP_ID = import.meta.env.VITE_ADZUNA_APP_ID;
const ADZUNA_APP_KEY = import.meta.env.VITE_ADZUNA_APP_KEY;
const BASE_URL = 'https://api.adzuna.com/v1/api/jobs';

// Adzuna gives country as a 2-letter code but no explicit currency field.
// Best-effort map for the countries Adzuna supports; falls back to USD.
const CURRENCY_BY_COUNTRY = {
  us: 'USD', gb: 'GBP', ca: 'CAD', au: 'AUD', de: 'EUR', fr: 'EUR',
  nl: 'EUR', at: 'EUR', be: 'EUR', it: 'EUR', es: 'EUR', pl: 'PLN',
  in: 'INR', sg: 'SGD', za: 'ZAR', nz: 'NZD', mx: 'MXN', br: 'BRL'
};

/**
 * Converts one raw Adzuna result into NormalizedJob shape.
 * @returns {import('./types.js').NormalizedJob}
 */
function normalizeAdzunaJob(raw, country) {
  const now = new Date().toISOString();

  return {
    id: buildJobId('adzuna', raw.id),
    source: 'adzuna',
    sourceId: raw.id,

    title: raw.title,
    company: raw.company?.display_name ?? null,
    location: raw.location?.display_name ?? null,
    workType: WORK_TYPE.UNKNOWN, // Adzuna exposes no structured signal for this
    description: raw.description ?? null, // excerpt, not full text
    employmentType: raw.contract_time ?? null, // e.g. "full_time", often missing

    minSalary: raw.salary_min ?? null, // Adzuna's salary_min/salary_max are annualized figures, not an hourly rate
    maxSalary: raw.salary_max ?? null,
    minHourly: null,
    maxHourly: null,
    currency: raw.salary_min != null || raw.salary_max != null
      ? (CURRENCY_BY_COUNTRY[country] ?? 'USD')
      : null,

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

  return allResults.slice(0, desiredCount).map((raw) => normalizeAdzunaJob(raw, country));
}
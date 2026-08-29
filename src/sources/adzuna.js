const ADZUNA_APP_ID = import.meta.env.VITE_ADZUNA_APP_ID;
const ADZUNA_APP_KEY = import.meta.env.VITE_ADZUNA_APP_KEY;
const BASE_URL = 'https://api.adzuna.com/v1/api/jobs';

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

  return allResults.slice(0, desiredCount);
}
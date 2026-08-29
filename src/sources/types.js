/**
 * @typedef {Object} NormalizedJob
 *
 * --- Identity ---
 * @property {string} id           - Dedup primary key: `${source}:${sourceId}`. Always present, built locally
 * @property {string} source       - Which adapter produced this
 * @property {string} sourceId     - The ID as defined by that source (Adzuna's `id`, Jooble's `id`, etc.).
 *
 * --- Core listing info ---
 * @property {string} title                - Always present, if somehow missing drop the posting
 * @property {string|null} company         - possibly null
 * @property {string|null} location        - Free-text location. Null if remote-only or unspecified
 * @property {boolean|null} remote         - true/false if the source says so explicitly, null if unknown
 * @property {string|null} description     - Often an EXCERPT, not the full posting (e.g. Adzuna truncates)
 *                                           Null only if the source gives literally nothing
 * @property {string|null} employmentType  - "full_time", "contract", etc. Null if unspecified
 *
 * --- Compensation ---
 * @property {number|null} salaryMin
 * @property {number|null} salaryMax
 * @property {string|null} salaryCurrency  - ISO code (e.g. "USD"). Null if no salary data at all.
 *
 * --- Links & timing ---
 * @property {string} url            - Link to the posting (or source's redirect). Always present; a posting without a link is useless
 * @property {string|null} postedAt  - ISO date string. default to 1 month ago if unknown (time changed in settings)
 * @property {string} fetchedAt      - ISO timestamp of when the user pulled the job
 *
 * --- Pipeline state (ours, not the source's) ---
 * @property {'new'|'filtered_out'|'shortlisted'|'applied'|'rejected'} status
 *
 * @property {string|null} filteredOutAt  - ISO timestamp of when the AI filter rejected it. Null until it happens
 * @property {string|null} shortlistedAt  - ISO timestamp of when it passed filtering. Null until it happens
 * @property {string|null} appliedAt      - ISO timestamp of when we actually applied. Null until it happens
 *
 * --- Fallback data ---
 * @property {string|null} raw     - JSON.stringify of the original source response for this posting.
 *
 */

export const JOB_STATUS = Object.freeze({
  NEW: 'new',
  FILTERED_OUT: 'filtered_out',
  SHORTLISTED: 'shortlisted',
  APPLIED: 'applied',
  REJECTED: 'rejected'
});

/**
 * Builds the dedup key every adapter must use.
 * @param {string} source
 * @param {string} sourceId
 * @returns {string}
 */
export function buildJobId(source, sourceId) {
  return `${source}:${sourceId}`;
}
<script>
  import questionMarkIcon from '../ui/assets/icons/question-mark.svg?raw';
  import filterIcon from '../ui/assets/icons/filter-icon.svg?raw';

  // TODO: replace with real data via dbClient.getJobsByStatus() once postings/dbClient wiring is in place
  let jobs = $state([
    {
      id: 'adzuna:1001',
      title: 'Senior frontend engineer',
      company: 'Notion',
      location: 'Remote',
      remote: true,
      status: 'new',
      postedAt: '2026-08-27',
      source: 'adzuna',
      employmentType: 'full_time',
      salaryMin: 115000,
      salaryMax: 140000,
      salaryCurrency: 'USD',
      salaryIsPredicted: false,
      description: 'Looking for a senior engineer to lead the editor rendering team, focused on real-time collaboration performance.',
      raw: { id: 1001, title: 'Senior frontend engineer', company: { display_name: 'Notion' }, salary_min: 115000, salary_max: 140000, salary_is_predicted: '0' }
    },
    {
      id: 'greenhouse:2002',
      title: 'Platform engineer, data infra',
      company: 'Anthropic',
      location: 'San Francisco, CA',
      remote: false,
      status: 'shortlisted',
      postedAt: '2026-08-24',
      source: 'greenhouse',
      employmentType: 'full_time',
      salaryMin: 160000,
      salaryMax: 210000,
      salaryCurrency: 'USD',
      salaryIsPredicted: true,
      description: null,
      raw: { id: 2002, title: 'Platform engineer, data infra', location: { name: 'San Francisco, CA' } }
    },
    {
      id: 'adzuna:3003',
      title: 'Backend engineer, payments',
      company: 'Stripe',
      location: 'Remote',
      remote: true,
      status: 'rejected',
      postedAt: '2026-08-15',
      source: 'adzuna',
      employmentType: 'full_time',
      salaryMin: 130000,
      salaryMax: 165000,
      salaryCurrency: 'USD',
      salaryIsPredicted: true,
      description: 'Build and maintain payment processing infrastructure at scale.',
      raw: { id: 3003, title: 'Backend engineer, payments', company: { display_name: 'Stripe' } }
    }
  ]);

  const STATUS_TABS = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'shortlisted', label: 'Shortlisted' },
    { key: 'applied', label: 'Applied' },
    { key: 'rejected', label: 'Rejected' }
  ];

  // stamp badges tilt only for these two statuses, everything else stays straight
  const STAMP_ROTATION = { new: -4, rejected: 4 };
  const STAMP_LABEL = { new: 'New', shortlisted: 'Shortlist', applied: 'Applied', rejected: 'Rejected', filtered_out: 'Filtered out' };

  let activeStatus = $state('all');
  let expandedIds = $state(new Set());
  let rawOpenIds = $state(new Set());
  let filters = $state({ remoteOnly: false, salaryListed: false, postedThisWeek: false });
  let showFilterMenu = $state(false);

  function statusCount(key) {
    if (key === 'all') return jobs.length;
    return jobs.filter((j) => j.status === key).length;
  }

  let filteredJobs = $derived(
    jobs.filter((j) => {
      if (activeStatus !== 'all' && j.status !== activeStatus) return false;
      if (filters.remoteOnly && j.remote !== true) return false;
      if (filters.salaryListed && j.salaryMin == null && j.salaryMax == null) return false;
      return true;
    })
  );

  function toggleExpanded(id) {
    const next = new Set(expandedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedIds = next;
  }

  function toggleRaw(id) {
    const next = new Set(rawOpenIds);
    next.has(id) ? next.delete(id) : next.add(id);
    rawOpenIds = next;
  }

  function toggleFilter(key) {
    filters = { ...filters, [key]: !filters[key] };
  }

  function formatSalary(job) {
    if (job.salaryMin == null && job.salaryMax == null) return null;
    if (job.salaryMin != null && job.salaryMax != null) {
      return `${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()}`;
    }
    return (job.salaryMin ?? job.salaryMax).toLocaleString();
  }
</script>

<div class="postings-page">
  <div class="status-tabs">
    {#each STATUS_TABS as tab}
      <button
        class="status-tab"
        class:active={activeStatus === tab.key}
        onclick={() => (activeStatus = tab.key)}
      >
        {tab.label} ({statusCount(tab.key)})
      </button>
    {/each}
  </div>

  <div class="dossier-panel">
    <div class="filters-row">
      <button
        class="icon-btn filter-btn"
        class:active={showFilterMenu}
        onclick={() => (showFilterMenu = !showFilterMenu)}
        aria-label="Custom filter"
        title="Custom filter"
      >
        {@html filterIcon}
      </button>
      <button class="chip" class:active={filters.remoteOnly} onclick={() => toggleFilter('remoteOnly')}>
        Remote only
      </button>
      <button class="chip" class:active={filters.salaryListed} onclick={() => toggleFilter('salaryListed')}>
        Salary listed
      </button>
      <button class="chip" class:active={filters.postedThisWeek} onclick={() => toggleFilter('postedThisWeek')}>
        Posted this week
      </button>
    </div>

    {#if showFilterMenu}
      <div class="custom-filter-menu">
        <p class="note">Custom filter builder goes here (field, operator, value).</p>
      </div>
    {/if}

    <div class="job-list">
      {#each filteredJobs as job (job.id)}
        <div class="job-card" class:closed={job.status === 'rejected' || job.status === 'filtered_out'}>
          <div class="job-row">
            <div
              class="stamp stamp-{job.status}"
              style={STAMP_ROTATION[job.status] ? `transform: rotate(${STAMP_ROTATION[job.status]}deg);` : ''}
            >
              {STAMP_LABEL[job.status] ?? job.status}
            </div>
            <div class="job-main">
              <p class="job-title">{job.title}</p>
              <p class="job-meta">{job.company} · {job.location} · posted {job.postedAt}</p>
            </div>
            <div class="job-salary">
              {#if formatSalary(job)}
                <span class="salary-flag" title={job.salaryIsPredicted ? 'Approximated' : 'Explicit'}>
                  {job.salaryIsPredicted ? '~' : '✓'}
                </span>
                <span class="salary-dollar">$</span>
                <span class="salary-amount">{formatSalary(job)}</span>
              {:else}
                <span class="salary-flag" title="Approximated">~</span>
                <span class="salary-amount muted">not listed</span>
              {/if}
            </div>
            <button class="more-info-btn" onclick={() => toggleExpanded(job.id)}>
              More info
              <span class="chevron" class:open={expandedIds.has(job.id)}>⌄</span>
            </button>
          </div>

          {#if expandedIds.has(job.id)}
            <div class="job-detail">
              <button
                class="icon-btn raw-btn"
                onclick={() => toggleRaw(job.id)}
                aria-label="View raw data"
                title="View raw data"
              >
                {@html questionMarkIcon}
              </button>
              <div class="job-detail-body">
                <p class="job-detail-line">
                  Employment type: {job.employmentType ?? 'unknown'} · Source: {job.source}
                </p>
                {#if job.description}
                  <p class="job-description">{job.description}</p>
                {:else}
                  <p class="job-description muted">No description provided.</p>
                {/if}
                {#if rawOpenIds.has(job.id)}
                  <pre class="raw-json">{JSON.stringify(job.raw, null, 2)}</pre>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if filteredJobs.length === 0}
        <p class="note">No postings match the current filters.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: #eef1f4;
  }

  .postings-page {
    --paper: #f4f6f8;
    --ink: #1f2933;
    --ink-muted: #7b8794;
    --border-strong: #b8c2cc;
    --border-soft: #dde3e8;
    --new: #2563a8;
    --shortlist: #2f855a;
    --applied: #285e61;
    --rejected: #a32d2d;
    font-family: system-ui, sans-serif;
    color: var(--ink);
    padding: 2rem;
    max-width: 960px;
    margin: 0 auto;
  }

  .status-tabs {
    display: flex;
  }
  .status-tab {
    padding: 8px 16px;
    background: var(--border-soft);
    border: 1px solid var(--border-strong);
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    font-size: 13px;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .status-tab.active {
    background: var(--paper);
    font-weight: 600;
    color: var(--ink);
  }

  .dossier-panel {
    border: 1px solid var(--border-strong);
    border-radius: 0 8px 8px 8px;
    background: var(--paper);
    padding: 1.25rem;
  }

  .filters-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
  }
  .filter-btn.active,
  .filter-btn:hover {
    border-color: var(--border-strong);
    background: var(--border-soft);
  }
  .chip {
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid var(--border-soft);
    background: transparent;
    cursor: pointer;
    color: var(--ink-muted);
  }
  .chip.active {
    border-color: var(--border-strong);
    background: var(--border-soft);
    color: var(--ink);
    font-weight: 500;
  }

  .custom-filter-menu {
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 1rem;
  }

  .job-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .job-card {
    border: 1px solid var(--border-soft);
    border-radius: 8px;
  }
  .job-card.closed {
    opacity: 0.55;
  }

  .job-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
  }

  .stamp {
    padding: 3px 10px;
    border: 1.5px solid;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    text-transform: uppercase;
  }
  .stamp-new { color: var(--new); border-color: var(--new); }
  .stamp-shortlisted { color: var(--shortlist); border-color: var(--shortlist); }
  .stamp-applied { color: var(--applied); border-color: var(--applied); }
  .stamp-rejected { color: var(--rejected); border-color: var(--rejected); }

  .job-main {
    flex: 1;
    min-width: 0;
  }
  .job-title {
    font-weight: 600;
    font-size: 14px;
    margin: 0 0 2px;
  }
  .job-meta {
    font-size: 12px;
    color: var(--ink-muted);
    margin: 0;
    font-family: ui-monospace, monospace;
  }

  .job-salary {
    display: flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
  }
  .salary-flag {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .salary-dollar {
    font-size: 18px;
    font-weight: 600;
  }
  .salary-amount {
    font-size: 13px;
  }
  .salary-amount.muted {
    color: var(--ink-muted);
    font-style: italic;
  }

  .more-info-btn {
    font-size: 12px;
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    background: transparent;
    border: 1px solid var(--border-soft);
    border-radius: 6px;
    cursor: pointer;
    color: var(--ink);
  }
  .chevron {
    display: inline-block;
    transition: transform 0.15s ease;
  }
  .chevron.open {
    transform: rotate(180deg);
  }

  .job-detail {
    border-top: 1px solid var(--border-soft);
    padding: 12px;
    display: flex;
    gap: 10px;
  }
  .raw-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
  }
  .job-detail-body {
    flex: 1;
    min-width: 0;
  }
  .job-detail-line {
    font-size: 12px;
    color: var(--ink-muted);
    margin: 0 0 6px;
  }
  .job-description {
    font-size: 13px;
    margin: 0;
  }
  .job-description.muted {
    color: var(--ink-muted);
    font-style: italic;
  }
  .raw-json {
    margin-top: 10px;
    padding: 10px;
    background: var(--border-soft);
    border-radius: 6px;
    font-size: 11px;
    overflow-x: auto;
  }

  .note {
    font-size: 13px;
    color: var(--ink-muted);
  }
</style>
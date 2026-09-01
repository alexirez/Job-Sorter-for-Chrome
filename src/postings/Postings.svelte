<script>
  import { onMount } from 'svelte';
  import questionMarkIcon from '../ui/assets/icons/question-mark.svg?raw';
  import filterIcon from '../ui/assets/icons/filter-icon.svg?raw';
  import chevronIcon from '../ui/assets/icons/chevron-icon.svg?raw';
  import './postings.css';

  let jobs = $state([]);
  let loading = $state(true);
  let loadError = $state('');

  onMount(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'postings:getAllJobs' });
      if (!response.ok) throw new Error(response.error);
      jobs = response.jobs;
    } catch (err) {
      loadError = err.message;
    } finally {
      loading = false;
    }
  });

  const STATUS_TABS = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'shortlisted', label: 'Shortlisted' },
    { key: 'applied', label: 'Applied' },
    { key: 'rejected', label: 'Rejected' }
  ];

  function formatRaw(raw) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw ?? 'No raw data stored.';
    }
  }

  const STAMP_ROTATION = { new: -4, rejected: 4 };
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  function stampFor(job) {
    if (job.status === 'new') {
      const isRecent = job.postedAt && Date.now() - new Date(job.postedAt).getTime() < THREE_DAYS_MS;
      return isRecent ? { label: 'New', rotate: -4 } : null;
    }
    if (job.status === 'rejected') return { label: 'Rejected', rotate: 4 };
    if (job.status === 'applied') return { label: 'Applied', rotate: 0 };
    return null;
  }

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
      {#if loading}
        <p class="note">Loading postings…</p>
      {:else if loadError}
        <p class="note">Couldn't load postings: {loadError}</p>
      {:else}
      {#each filteredJobs as job (job.id)}
      {@const stamp = stampFor(job)}
        <div class="job-card" class:closed={job.status === 'rejected' || job.status === 'filtered_out'}>
          <div
            class="job-row"
            role="button"
            tabindex="0"
            aria-expanded={expandedIds.has(job.id)}
            onclick={() => toggleExpanded(job.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(job.id); } }}
          >
          {#if stamp}
          <div
            class="stamp stamp-{job.status}"
            style={stamp.rotate ? `transform: rotate(${stamp.rotate}deg);` : ''}
          >
            {stamp.label}
          </div>
            {/if}
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
            <span class="chevron" class:open={expandedIds.has(job.id)}>{@html chevronIcon}</span>
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
                  <pre class="raw-json">{formatRaw(job.raw)}</pre>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if filteredJobs.length === 0}
        <p class="note">No postings match the current filters.</p>
      {/if}
        {/if}
    </div>
  </div>
</div>
<script>
  import { onMount } from 'svelte';
  import {
     questionMarkIcon, filterIcon, chevronIcon, deleteIcon, archiveIcon,
     applyIcon, uploadIcon, chevronsIcon, userIcon, preferencesIcon,
     settingsIcon, fileTextIcon
  } from '../ui/assets/icons';
  import './postings.css';

  let jobs = $state([]);
  let loadingState = $state('loading'); // 'loading' | 'idle' | 'filtering'
  let loadError = $state('');

  let selectAllNode;

  onMount(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'postings:getAllJobs' });
      if (!response.ok) throw new Error(response.error);
      jobs = response.jobs;
    } catch (err) {
      loadError = err.message;
    } finally {
      loadingState = 'idle';
    }
  });

  const STATUS_TABS = [ 
      { key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'shortlisted', label: 'Shortlisted' }, 
      { key: 'applied', label: 'Applied' }, { key: 'rejected', label: 'Rejected' }
  ];

  function formatRaw(raw) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw ?? 'No raw data stored.'; }
  }

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const HOURS_PER_YEAR = 2080;
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
  let filterMenuNode = $state(null);

  const COMP_TYPES = {
    salary: { min: 0, max: 500000, step: 1000, prefix: '$' },
    hourly: { min: 0, max: 240, step: 1, prefix: '$' }
  };
  const WORK_TYPES = [
    { key: 'inPerson', label: 'In-person' },
    { key: 'remote', label: 'Remote' },
    { key: 'hybrid', label: 'Hybrid' },
    { key: 'unknown', label: 'Unknown' }
  ];
  const POSTED_WITHIN = [
    { key: '24h', label: '24h' },
    { key: '3d', label: '3d' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'any', label: 'Any' }
  ];

  function defaultFilterState() {
    return {
      postedWithin: 'any',
      compType: 'salary',
      salaryMin: 60000,
      salaryMax: 180000,
      hourlyMin: 20,
      hourlyMax: 80,
      idealPayEnabled: false,
      idealPay: 120000,
      workType: { inPerson: true, remote: true, hybrid: true, unknown: true },
      includeKeywords: [],
      excludeKeywords: [],
      aiFilterEnabled: false,
      aiFilterPrompt: ''
    };
  }

  // The filters actually applied to the job list right now.
  let appliedFilterState = $state(defaultFilterState());
  // A scratch copy the popup edits. Only copied into appliedFilterState on Apply,
  // so closing the popup any other way (X, backdrop, Escape) discards edits.
  let draftFilterState = $state(defaultFilterState());

  let includeKeywordInput = $state('');
  let excludeKeywordInput = $state('');
  let compTrackNode = $state(null);

  function openFilterMenu() {
    draftFilterState = $state.snapshot(appliedFilterState);
    showFilterMenu = true;
  }

  function closeFilterMenu() {
    showFilterMenu = false;
  }

  function toggleWorkType(key) {
    draftFilterState.workType = { ...draftFilterState.workType, [key]: !draftFilterState.workType[key] };
  }

  function commitKeyword(listKey, rawValue) {
    const parts = rawValue.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    draftFilterState[listKey] = [...draftFilterState[listKey], ...parts];
    return '';
  }

  function handleKeywordKeydown(listKey, event) {
    const isInclude = listKey === 'includeKeywords';
    const value = isInclude ? includeKeywordInput : excludeKeywordInput;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const next = commitKeyword(listKey, value);
      if (isInclude) includeKeywordInput = next; else excludeKeywordInput = next;
    } else if (event.key === 'Backspace' && value === '' && draftFilterState[listKey].length > 0) {
      draftFilterState[listKey] = draftFilterState[listKey].slice(0, -1);
    }
  }

  function handleKeywordBlur(listKey) {
    const isInclude = listKey === 'includeKeywords';
    const value = isInclude ? includeKeywordInput : excludeKeywordInput;
    const next = commitKeyword(listKey, value);
    if (isInclude) includeKeywordInput = next; else excludeKeywordInput = next;
  }

  function removeKeyword(listKey, index) {
    draftFilterState[listKey] = draftFilterState[listKey].filter((_, i) => i !== index);
  }

  function compBounds() {
    return COMP_TYPES[draftFilterState.compType];
  }

  function compMinValue() {
    return draftFilterState.compType === 'salary' ? draftFilterState.salaryMin : draftFilterState.hourlyMin;
  }

  function compMaxValue() {
    return draftFilterState.compType === 'salary' ? draftFilterState.salaryMax : draftFilterState.hourlyMax;
  }

  function compPercent(value) {
    const { min, max } = compBounds();
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }

  function clampComp(value) {
    const { min, max } = compBounds();
    return Math.min(max, Math.max(min, value));
  }

  function formatComp(value) {
    return Math.round(value).toLocaleString();
  }

  function setCompMin(raw) {
    const parsed = Number(String(raw).replace(/[^0-9.]/g, ''));
    if (Number.isNaN(parsed)) return;
    const key = draftFilterState.compType === 'salary' ? 'salaryMin' : 'hourlyMin';
    const maxVal = compMaxValue();
    draftFilterState[key] = Math.min(clampComp(parsed), maxVal);
    reclampIdealPay();
  }

  function setCompMax(raw) {
    const parsed = Number(String(raw).replace(/[^0-9.]/g, ''));
    if (Number.isNaN(parsed)) return;
    const key = draftFilterState.compType === 'salary' ? 'salaryMax' : 'hourlyMax';
    const minVal = compMinValue();
    draftFilterState[key] = Math.max(clampComp(parsed), minVal);
    reclampIdealPay();
  }

  function reclampIdealPay() {
    if (!draftFilterState.idealPayEnabled) return;
    const minV = compMinValue();
    const maxV = compMaxValue();
    if (draftFilterState.idealPay < minV || draftFilterState.idealPay > maxV)
      draftFilterState.idealPay = (minV + maxV) / 2;
  }
  function salaryToHourly(v) { return clampToBounds(v / HOURS_PER_YEAR, COMP_TYPES.hourly); }
  function hourlyToSalary(v) { return clampToBounds(v * HOURS_PER_YEAR, COMP_TYPES.salary); }
  function clampToBounds(v, bounds) { return Math.min(bounds.max, Math.max(bounds.min, v)); }

  function setCompType(type) {
    if (type === draftFilterState.compType) return;
    if (type === 'hourly') {
      draftFilterState.hourlyMin = salaryToHourly(draftFilterState.salaryMin);
      draftFilterState.hourlyMax = salaryToHourly(draftFilterState.salaryMax);
      draftFilterState.idealPay = salaryToHourly(draftFilterState.idealPay);
    } else {
      draftFilterState.salaryMin = hourlyToSalary(draftFilterState.hourlyMin);
      draftFilterState.salaryMax = hourlyToSalary(draftFilterState.hourlyMax);
      draftFilterState.idealPay = hourlyToSalary(draftFilterState.idealPay);
    }
    draftFilterState.compType = type;
  }

  function startIdealDrag(event) {
    if (!draftFilterState.idealPayEnabled || !compTrackNode) return;
    event.preventDefault();
    function onMove(e) {
      const rect = compTrackNode.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const { min, max } = compBounds();
      draftFilterState.idealPay = clampComp(Math.round(min + ratio * (max - min)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleIdealKeydown(event) {
    const { min, max, step } = compBounds();
    let delta = 0;
    if (event.key === 'ArrowLeft') delta = -step;
    else if (event.key === 'ArrowRight') delta = step;
    else return;
    event.preventDefault();
    draftFilterState.idealPay = Math.min(max, Math.max(min, draftFilterState.idealPay + delta));
  }

  function startCompDrag(which) {
    return (event) => {
      if (!compTrackNode) return;
      event.preventDefault();
      const { min, max, step } = compBounds();
      function onMove(e) {
        const rect = compTrackNode.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const raw = clampComp(Math.round(min + ratio * (max - min)));
        if (which === 'min')
          setCompMin(Math.min(raw, compMaxValue() - step));
        else
          setCompMax(Math.max(raw, compMinValue() + step));
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  function handleCompHandleKeydown(which) {
    return (event) => {
      const { step } = compBounds();
      let delta = 0;
      if (event.key === 'ArrowLeft') delta = -step;
      else if (event.key === 'ArrowRight') delta = step;
      else return;
      event.preventDefault();
      if (which === 'min') setCompMin(compMinValue() + delta);
      else setCompMax(compMaxValue() + delta);
    };
  }

  function applyFilters() {
    appliedFilterState = $state.snapshot(draftFilterState);
    showFilterMenu = false;
    loadingState = 'filtering';
    // TODO: recompute filteredJobs / message background using appliedFilterState
    // (postedWithin, salary/hourly range, workType, include/exclude keywords, AI filter)
    // Placeholder timing until the real query/scoring pass exists.
    setTimeout(() => { loadingState = 'idle'; }, 3200);
  }

  function clearDraftFilters() {
    draftFilterState = defaultFilterState();
  }

  $effect(() => {
    if (showFilterMenu && filterMenuNode) filterMenuNode.focus();
  });

  $effect(() => {
    if (!showFilterMenu) return;
    function onKey(e) { if (e.key === 'Escape') showFilterMenu = false; }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    if (!activeDetailModal && !showResumesModal) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      activeDetailModal = null;
      showResumesModal = false;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Multi-select
  let selectedIds = $state(new Set());

  const SIDEBAR_WIDTH_EXPANDED = 240;
  const SIDEBAR_WIDTH_COLLAPSED = 56;
  let sidebarCollapsed = $state(false);
  let activeDetailModal = $state(null); // 'personal' | 'preferences' | null
  let showResumesModal = $state(false);
  let wipeConfirming = $state(false);
  let wiping = $state(false);
  let wipeError = $state('');
  let wipeConfirmTimeout;
  let resumes = $state([]);

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
    if (job.salaryMin != null && job.salaryMax != null)
      return `${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()}`;
    return (job.salaryMin ?? job.salaryMax).toLocaleString();
  }

  function toggleSelect(id, event) {
    event.stopPropagation();
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedIds = next;
  }

  function toggleSelectAllVisible() {
    // Anything selected at all → clear it. Nothing selected → select every visible job.
    selectedIds = selectedIds.size > 0 ? new Set() : new Set(filteredJobs.map((j) => j.id));
  }

  function handleSelectAllClick(event) {
    toggleSelectAllVisible();
    // selectAllNode comes from bind:this — a stable reference to the
    // element itself, independent of how this handler gets invoked.
    selectAllNode.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredJobs.length;
    selectAllNode.checked = selectedIds.size > 0;
  } 

  // Svelte has no `indeterminate` HTML attribute (it's a DOM-only property,
  // not reflected in markup), so a small action sets it directly on the node.
  function setIndeterminate(node, value) {
    node.indeterminate = value;
    return { update(next) { node.indeterminate = next; } };
  }

  // TODO: wire these up to real background messages once archive/delete land
  function archiveSelected() {
    // chrome.runtime.sendMessage({ type: 'postings:archiveJobs', ids: [...selectedIds] })
    selectedIds = new Set();
  }

  function deleteSelected() {
    // chrome.runtime.sendMessage({ type: 'postings:deleteJobs', ids: [...selectedIds] })
    selectedIds = new Set();
  }

  // TODO: kick off the automation pipeline
  function beginApplying() {}

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }

  function openDetailModal(which) {
    activeDetailModal = which;
  }

  function closeDetailModal() {
    activeDetailModal = null;
    wipeConfirming = false;
    wipeError = '';
    clearTimeout(wipeConfirmTimeout);
  }

  function addResume(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    resumes = [...resumes, { id: crypto.randomUUID(), name: file.name, tags: [] }];
    e.target.value = '';
  }

  function removeResume(id) {
    resumes = resumes.filter((r) => r.id !== id);
  }

  function addResumeTag(id, rawValue) {
    const value = rawValue.trim();
    if (!value) return;
    resumes = resumes.map((r) => (r.id === id ? { ...r, tags: [...r.tags, value] } : r));
  }

  function removeResumeTag(id, index) {
    resumes = resumes.map((r) => (r.id === id ? { ...r, tags: r.tags.filter((_, i) => i !== index) } : r));
  }

  function requestWipe() {
    if (!wipeConfirming) {
      wipeConfirming = true;
      clearTimeout(wipeConfirmTimeout);
      wipeConfirmTimeout = setTimeout(() => (wipeConfirming = false), 4000);
      return;
    }
    performWipe();
  }

  async function performWipe() {
    clearTimeout(wipeConfirmTimeout);
    wipeConfirming = false;
    wiping = true;
    wipeError = '';
    try {
      const response = await chrome.runtime.sendMessage({ type: 'postings:wipeJobs' });
      if (!response.ok) throw new Error(response.error);
      jobs = [];
      selectedIds = new Set();
      expandedIds = new Set();
      rawOpenIds = new Set();
      activeDetailModal = null;
    } catch (err) {
      wipeError = err.message;
    } finally {
      wiping = false;
    }
  }
</script>

  <div class="postings-page" style="--sidebar-w: {sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px;">  <div class="fixed-topbar">
    <div class="segmented-control">
      {#each STATUS_TABS as tab}
        <button class="segment" class:active={activeStatus === tab.key} onclick={() => (activeStatus = tab.key)}>
          {tab.label} <span class="segment-count">{statusCount(tab.key)}</span>
        </button>
      {/each}
    </div>

    <div class="filters-row">
      <div class="select-all-wrap">
        <input
          type="checkbox"
          class="select-all-checkbox"
          bind:this={selectAllNode}
          checked={selectedIds.size > 0}
          use:setIndeterminate={selectedIds.size > 0 && selectedIds.size < filteredJobs.length}
          onclick={handleSelectAllClick}
          aria-label="Select or deselect all visible postings"
        />
        {#if selectedIds.size > 0}
          <span class="select-all-tooltip">{selectedIds.size} selected</span>
        {/if}
      </div>
      {#if selectedIds.size > 0}
        <div class="selection-actions">
          <span class="selection-count">{selectedIds.size} selected</span>
          <button class="icon-btn" onclick={archiveSelected} aria-label="Mark as Old" title="Mark as Old">
            {@html archiveIcon}
          </button>
          <button class="icon-btn danger" onclick={deleteSelected} aria-label="Delete permanently" title="Delete permanently">
            {@html deleteIcon}
          </button>
        </div>
      {:else}
        <button
          class="icon-btn filter-btn"
          class:active={showFilterMenu}
          onclick={openFilterMenu}
          aria-label="Custom filter"
          title="Custom filter"
        >
          {@html filterIcon}
        </button>
        <button class="chip" class:active={filters.remoteOnly} onclick={() => toggleFilter('remoteOnly')}>Remote only</button>
        <button class="chip" class:active={filters.salaryListed} onclick={() => toggleFilter('salaryListed')}>Salary listed</button>
        <button class="chip" class:active={filters.postedThisWeek} onclick={() => toggleFilter('postedThisWeek')}>Posted this week</button>
      {/if}
    </div>

    {#if showFilterMenu}
      <div
        class="filter-menu-backdrop"
        role="button"
        tabindex="0"
        aria-label="Close filter menu"
        onclick={closeFilterMenu}
        onkeydown={(e) => { if (e.key === 'Escape') closeFilterMenu(); }}
      >
        <div
          class="custom-filter-menu"
          role="dialog"
          aria-label="Custom filter"
          aria-modal="true"
          tabindex="-1"
          bind:this={filterMenuNode}
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => { if (e.key === 'Escape') closeFilterMenu(); e.stopPropagation(); }}
        >
          <div class="filter-popup-header">
            <span>Filters</span>
            <button class="icon-btn filter-popup-close" onclick={closeFilterMenu} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
            </button>
          </div>

          <div class="filter-sections">
            <div class="filter-section">
              <div class="filter-section-header">                
                <span>Posted within</span>
                <span class="filter-section-summary">
                  {POSTED_WITHIN.find((o) => o.key === draftFilterState.postedWithin)?.label}
                </span>
              </div>
              <div class="filter-section-body">
                <div class="pill-row">
                  {#each POSTED_WITHIN as opt}
                    <button class="pill-toggle" class:active={draftFilterState.postedWithin === opt.key} onclick={() => (draftFilterState.postedWithin = opt.key)}>
                      {opt.label}
                    </button>
                  {/each}
                </div>
              </div>
            </div>

            <div class="filter-section">
              <div class="filter-section-header">                
                <span>Compensation</span>
                <span class="filter-section-summary">
                  {draftFilterState.compType === 'salary' ? 'Salary' : 'Hourly'}: {compBounds().prefix}{formatComp(compMinValue())}&ndash;{compBounds().prefix}{formatComp(compMaxValue())}
                </span>
              </div>
              <div class="filter-section-body">
                <div class="pill-row">
                  <button class="pill-toggle comp-type-toggle" class:active={draftFilterState.compType === 'salary'} onclick={() => setCompType('salary')}>Salary</button>
                  <button class="pill-toggle comp-type-toggle" class:active={draftFilterState.compType === 'hourly'} onclick={() => setCompType('hourly')}>Hourly</button>
                </div>

                <div class="comp-inputs">
                  <input class="comp-text-input" value={formatComp(compMinValue())} onchange={(e) => setCompMin(e.target.value)} aria-label="Minimum" />
                  <span class="comp-to">to</span>
                  <input class="comp-text-input" value={formatComp(compMaxValue())} onchange={(e) => setCompMax(e.target.value)} aria-label="Maximum" />
                </div>

                <div class="comp-track" bind:this={compTrackNode}>
                  <div class="comp-track-base"></div>
                  <div class="comp-track-fill" style="left: {compPercent(compMinValue())}%; right: {100 - compPercent(compMaxValue())}%;"></div>
                  <div
                    class="comp-handle"
                    style="left: {compPercent(compMinValue())}%;"
                    role="slider"
                    tabindex="0"
                    aria-label="Minimum {draftFilterState.compType}"
                    aria-valuenow={compMinValue()}
                    aria-valuemin={compBounds().min}
                    aria-valuemax={compMaxValue()}
                    onpointerdown={startCompDrag('min')}
                    onkeydown={handleCompHandleKeydown('min')}
                  ></div>
                  <div
                    class="comp-handle"
                    style="left: {compPercent(compMaxValue())}%;"
                    role="slider"
                    tabindex="0"
                    aria-label="Maximum {draftFilterState.compType}"
                    aria-valuenow={compMaxValue()}
                    aria-valuemin={compMinValue()}
                    aria-valuemax={compBounds().max}
                    onpointerdown={startCompDrag('max')}
                    onkeydown={handleCompHandleKeydown('max')}
                  ></div>
                  {#if draftFilterState.idealPayEnabled}
                    <div
                      class="comp-ideal-marker"
                      style="left: {compPercent(draftFilterState.idealPay)}%;"
                      role="slider"
                      tabindex="0"
                      aria-label="Ideal pay target"
                      aria-valuenow={draftFilterState.idealPay}
                      aria-valuemin={compBounds().min}
                      aria-valuemax={compBounds().max}
                      onpointerdown={startIdealDrag}
                      onkeydown={handleIdealKeydown}
                    ></div>
                  {/if}
                </div>
                <div class="comp-track-labels">
                  <span>{compBounds().prefix}{formatComp(compBounds().min)}</span>
                  <span>{compBounds().prefix}{formatComp(compBounds().max)}+</span>
                </div>

                <label class="ideal-toggle-row">
                  <span>Set an ideal pay target</span>
                  <span class="toggle-switch" class:on={draftFilterState.idealPayEnabled}>
                    <input
                      type="checkbox"
                      class="sr-only-checkbox"
                      checked={draftFilterState.idealPayEnabled}
                      onchange={() => {
                        draftFilterState.idealPayEnabled = !draftFilterState.idealPayEnabled;
                        reclampIdealPay();
                      }}                    />
                  </span>
                </label>
                {#if draftFilterState.idealPayEnabled}
                  <p class="filter-hint">Drag the marker to influence sort, not filtering. Currently {compBounds().prefix}{formatComp(draftFilterState.idealPay)}.</p>
                {/if}
              </div>
            </div>

            <div class="filter-section">
              <div class="filter-section-header">
                <span>Work type</span>
                <span class="filter-section-summary">
                  {Object.values(draftFilterState.workType).every(Boolean) ? 'All included' : `${Object.values(draftFilterState.workType).filter(Boolean).length} of 4`}
                </span>
              </div>
               <div class="filter-section-body">
                 <div class="work-type-grid">
                   {#each WORK_TYPES as wt}
                     <label class="work-type-item">
                       <input type="checkbox" checked={draftFilterState.workType[wt.key]} onchange={() => toggleWorkType(wt.key)} />
                       {wt.label}
                     </label>
                   {/each}
                 </div>
               </div>
            </div>

            <div class="filter-section">
              <div class="filter-section-header">
                <span>Keywords</span>
                <span class="filter-section-summary">
                  {draftFilterState.includeKeywords.length} include, {draftFilterState.excludeKeywords.length} exclude
                </span>
              </div>
              <div class="filter-section-body">
                <label class="keyword-label" for="include-kw-input">Include</label>
                <div class="keyword-input-box">
                  {#each draftFilterState.includeKeywords as kw, i}
                    <span class="keyword-pill include">
                      {kw}
                      <button class="keyword-pill-remove" onclick={() => removeKeyword('includeKeywords', i)} aria-label="Remove {kw}">×</button>
                    </span>
                  {/each}
                  <input
                    id="include-kw-input"
                    class="keyword-input"
                    bind:value={includeKeywordInput}
                    onkeydown={(e) => handleKeywordKeydown('includeKeywords', e)}
                    onblur={() => handleKeywordBlur('includeKeywords')}
                    placeholder="add keyword..."
                  />
                </div>

                <label class="keyword-label" for="exclude-kw-input">Exclude</label>
                <div class="keyword-input-box">
                  {#each draftFilterState.excludeKeywords as kw, i}
                    <span class="keyword-pill exclude">
                      {kw}
                      <button class="keyword-pill-remove" onclick={() => removeKeyword('excludeKeywords', i)} aria-label="Remove {kw}">×</button>
                    </span>
                  {/each}
                  <input
                    id="exclude-kw-input"
                    class="keyword-input"
                    bind:value={excludeKeywordInput}
                    onkeydown={(e) => handleKeywordKeydown('excludeKeywords', e)}
                    onblur={() => handleKeywordBlur('excludeKeywords')}
                    placeholder="add keyword..."
                  />
                </div>
              </div>
            </div>

            <div class="filter-section">
              <label class="filter-section-header ai-filter-header">
                <span>AI filter</span>
                <span class="toggle-switch" class:on={draftFilterState.aiFilterEnabled}>
                  <input
                    type="checkbox"
                    class="sr-only-checkbox"
                    checked={draftFilterState.aiFilterEnabled}
                    onchange={() => (draftFilterState.aiFilterEnabled = !draftFilterState.aiFilterEnabled)}
                  />
                </span>
              </label>
              {#if draftFilterState.aiFilterEnabled}
                <div class="filter-section-body">
                  <textarea
                    class="ai-filter-textarea"
                    bind:value={draftFilterState.aiFilterPrompt}
                    placeholder="e.g. exclude anything requiring a security clearance"
                  ></textarea>
                  <p class="filter-hint">Sends job descriptions to an AI model to classify against this prompt.</p>
                </div>
              {/if}
            </div>
          </div>

          <div class="filter-popup-footer">
            <button class="chip" onclick={clearDraftFilters}>Clear all</button>
            <button class="chip apply-btn" onclick={applyFilters}>Apply</button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <button
    class="begin-applying-btn"
    onclick={beginApplying}
    aria-label="Begin Applying"
    title="Begin Applying"
  >
    {@html applyIcon}
    Begin Applying
  </button>
  {#if loadingState === 'filtering'}
    <div class="applying-filters-wrap">
      <div class="applying-filters-pill">
        <span class="applying-filters-spinner"></span>
        Applying filters…
      </div>
    </div>
  {/if}

    <aside class="details-sidebar" class:collapsed={sidebarCollapsed}>
    <div class="sidebar-header">
      <button
        class="sidebar-collapse-btn"
        onclick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand' : 'Collapse'}
      >
        <span class="sidebar-collapse-icon" class:flipped={sidebarCollapsed}>{@html chevronsIcon}</span>
      </button>
    </div>

    <div class="sidebar-scroll">
      <div class="sidebar-section">
        <div class="fill-details-row">
          <!-- TODO: compute this from real section-completion state -->
          <div class="completeness-ring"><span>2/3</span></div>
          <div>
            <p class="sidebar-heading sidebar-label">Fill details</p>
            <p class="sidebar-subtext sidebar-label">2 of 3 sections done</p>
          </div>
        </div>
        <button class="sidebar-btn" onclick={() => openDetailModal('personal')}>
          {@html userIcon}
          <span class="sidebar-label">Edit personal info</span>
        </button>
        <button class="sidebar-btn" onclick={() => openDetailModal('preferences')}>
          {@html preferencesIcon}
          <span class="sidebar-label">Edit preferences</span>
        </button>
      </div>

      <div class="sidebar-section">
        <button class="sidebar-btn sidebar-btn-outline" onclick={() => (showResumesModal = true)}>
          {@html uploadIcon}
          <span class="sidebar-label" style="flex:1;">Upload resume</span>
          {#if resumes.length > 0}
            <span class="sidebar-count sidebar-label">{resumes.length}</span>
          {/if}
        </button>
      </div>

      <div class="sidebar-divider"></div>

      <div class="sidebar-section sidebar-section-plain">
        <button class="sidebar-btn" title="View archived">
          {@html archiveIcon}
          <span class="sidebar-label">View archived</span>
        </button>
        <button class="sidebar-btn">
          {@html settingsIcon}
          <span class="sidebar-label">Settings</span>
        </button>
        <button class="sidebar-btn" onclick={() => openDetailModal('help')}>
          {@html questionMarkIcon}
          <span class="sidebar-label">Help</span>
        </button>
      </div>

      <p class="sidebar-stat sidebar-label">{jobs.length} postings tracked this week</p>
    </div>

    <p class="sidebar-version sidebar-label">v0.4.2</p>
  </aside>

  {#if activeDetailModal}
    <div
      class="filter-menu-backdrop"
      role="button"
      tabindex="0"
      aria-label="Close"
      onclick={closeDetailModal}
      onkeydown={(e) => { if (e.key === 'Escape') closeDetailModal(); }}
    >
      <div
        class="custom-filter-menu compact"
        role="dialog"
        aria-modal="true"
        aria-label={activeDetailModal === 'personal' ? 'Edit personal info'
          : activeDetailModal === 'preferences' ? 'Edit preferences' : 'Help'}
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') closeDetailModal(); e.stopPropagation(); }}
      >
        <div class="filter-popup-header">
          <span>
            {activeDetailModal === 'personal' ? 'Edit personal info'
             : activeDetailModal === 'preferences' ? 'Edit preferences'
             : 'Help'}
          </span>
          <button class="icon-btn filter-popup-close" onclick={closeDetailModal} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
          </button>
        </div>
        {#if activeDetailModal === 'personal'}
          <p class="filter-hint"><!-- TODO: real fields -->Name, email, phone, and links used to prefill applications.</p>
        {:else if activeDetailModal === 'preferences'}
          <p class="filter-hint"><!-- TODO: real fields -->Auto-fill screening questions, and which listings to skip.</p>
        {:else}
          <p class="filter-hint"><!-- TODO: real help content --></p>

          <div class="danger-zone">
            <p class="sidebar-heading" style="font-size:13px; margin:0 0 4px;">Start over</p>
            <p class="filter-hint">Permanently deletes every stored posting and resets the database. This can't be undone.</p>
            <button
              class="chip wipe-btn"
              class:confirming={wipeConfirming}
              disabled={wiping}
              onclick={requestWipe}
            >
              {#if wiping}
                Wiping…
              {:else if wipeConfirming}
                Click again to confirm
              {:else}
                Wipe job postings
              {/if}
            </button>
            {#if wipeError}
              <p class="filter-hint wipe-error">Couldn't wipe: {wipeError}</p>
            {/if}
          </div>
        {/if}
        <div class="filter-popup-footer">
          <button class="chip" onclick={closeDetailModal}>Close</button>
          {#if activeDetailModal !== 'help'}
            <button class="chip apply-btn" onclick={closeDetailModal}>Save changes</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if showResumesModal}
    <div
      class="filter-menu-backdrop"
      role="button"
      tabindex="0"
      aria-label="Close"
      onclick={() => (showResumesModal = false)}
      onkeydown={(e) => { if (e.key === 'Escape') showResumesModal = false; }}
    >
      <div
        class="custom-filter-menu compact"
        role="dialog"
        aria-modal="true"
        aria-label="Resumes"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') showResumesModal = false; e.stopPropagation(); }}
      >    
        <div class="filter-popup-header">
          <span>Resumes</span>
          <button class="icon-btn filter-popup-close" onclick={() => (showResumesModal = false)} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
          </button>
        </div>
        <p class="filter-hint">Tag each resume with the titles it should be used for.</p>

        <div class="resumes-list">
          {#each resumes as resume (resume.id)}
            <div class="resume-row">
              <div class="resume-row-top">
                {@html fileTextIcon}
                <span class="resume-name">{resume.name}</span>
                <button class="icon-btn" onclick={() => removeResume(resume.id)} aria-label="Remove {resume.name}">
                  {@html deleteIcon}
                </button>
              </div>
              <div class="resume-tags">
                {#each resume.tags as tag, i}
                  <span class="keyword-pill include">
                    {tag}
                    <button class="keyword-pill-remove" onclick={() => removeResumeTag(resume.id, i)} aria-label="Remove {tag}">×</button>
                  </span>
                {/each}
                <input
                  class="resume-tag-input"
                  placeholder="add a title tag..."
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addResumeTag(resume.id, e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          {:else}
            <p class="note">No resumes uploaded yet.</p>
          {/each}
        </div>

        <label class="add-resume-dropzone">
          {@html uploadIcon}
          <span>Add another resume</span>
          <input type="file" accept=".pdf,.doc,.docx" hidden onchange={addResume} />
        </label>

        <div class="filter-popup-footer">
          <button class="chip" onclick={() => (showResumesModal = false)}>Close</button>
          <button class="chip apply-btn" onclick={() => (showResumesModal = false)}>Save changes</button>
        </div>
      </div>
    </div>
  {/if}

  <div class="content-flow">
    {#if loadingState === 'loading'}
      <p class="note">Loading postings…</p>
    {:else if loadError}
      <p class="note">Couldn't load postings: {loadError}</p>
    {:else}
      {#each filteredJobs as job (job.id)}
        {@const stamp = stampFor(job)}
        <div class="job-card" class:closed={job.status === 'rejected' || job.status === 'filtered_out'} class:selected={selectedIds.has(job.id)}>
          <div
            class="job-row"
            role="button"
            tabindex="0"
            aria-expanded={expandedIds.has(job.id)}
            onclick={() => toggleExpanded(job.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(job.id); } }}
          >
            <input class="job-checkbox" type="checkbox" checked={selectedIds.has(job.id)} onclick={(e) => toggleSelect(job.id, e)} aria-label="Select posting" />
            {#if stamp}
              <div class="stamp stamp-{job.status}" style={stamp.rotate ? `transform: rotate(${stamp.rotate}deg);` : ''}>{stamp.label}</div>
            {/if}
            <div class="job-main">
              <p class="job-title">{job.title}</p>
              <p class="job-meta">{job.company} · {job.location} · posted {job.postedAt}</p>
            </div>
            <div class="job-salary">
              {#if formatSalary(job)}
                <span class="salary-flag" title={job.salaryIsPredicted ? 'Approximated' : 'Explicit'}>{job.salaryIsPredicted ? '~' : '✓'}</span>
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
              <button class="icon-btn raw-btn" onclick={() => toggleRaw(job.id)} aria-label="View raw data" title="View raw data">
                {@html questionMarkIcon}
              </button>
              <div class="job-detail-body">
                <p class="job-detail-line">Employment type: {job.employmentType ?? 'unknown'} · Source: {job.source}</p>
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
      <p class="end-of-list">You've reached the end.</p>
    {/if}
  </div>
</div>
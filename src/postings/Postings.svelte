<script>
  import { onMount } from 'svelte';
  import {
    questionMarkIcon, filterIcon, chevronIcon, deleteIcon, archiveIcon,
    applyIcon, uploadIcon, chevronsIcon, userIcon, preferencesIcon,
    settingsIcon, fileTextIcon, slidersIcon, boltIcon, eyeOffIcon,
    starIcon, warnTriIcon, shieldCheckIcon, syncIcon,
    closeIcon, githubIcon
  } from '../ui/assets/icons';
  import './postings.css';
  import { cubicOut } from 'svelte/easing';
  import * as Store from './data/storage';
  import { 
    defaultPrefs, defaultSettings, defaultPersonal, defaultResumes, defaultFilterState, newResume, newSchool, newJob, MIN_RESUMES
  } from './data/defaults';
  import {
    DAY_MS, THREE_DAYS_MS, HOURS_PER_YEAR, STATUS_TILES, QUICK_FILTERS, SORT_OPTIONS, OPEN_STATUSES, MANUAL_COUNT, MODAL_TITLES, SAVEABLE_MODALS, LARGE_MODALS, NEEDS_LOAD_MODALS, COMP_TYPES, WORK_TYPES, POSTED_WITHIN, JOB_TYPES, RACE_OPTIONS, CARD_COLORS, BONUS_COLOR, KIND_LABELS, STAR_FIELDS, QUESTIONS, BASIC_TOTAL, PREF_FIELDS, AUTOMATION_OPTIONS, RESUME_COLORS, SETTINGS_SECTIONS, SEC, SOURCE_FIELDS, AI_PROVIDERS, AI_KEY_PLACEHOLDERS, AI_MODELS, AI_TEST_LABELS, EMAIL_DOMAINS, EMAIL_OTHER
  } from './data/constants';

  // ---- Core state ----
  let jobs = $state([]);
  let loadingState = $state('loading'); // 'loading' | 'idle' | 'filtering'
  let loadError = $state('');
  let loaded = $state(false); // saved data has been read; autosave and settings modals wait for this

  let prefs = $state(defaultPrefs());
  let settings = $state(defaultSettings());
  let personal = $state(defaultPersonal());
  let resumes = $state(defaultResumes());

  let selectAllNode;

  let removingIds = $state(new Set()); // state for animated deletion
  const STALL_DELETIONS_MS = 400;

  onMount(async () => {
    [prefs, settings, personal, resumes] = await Promise.all([
      Store.load('prefs', defaultPrefs()),
      Store.load('settings', defaultSettings()),
      Store.load('personal', defaultPersonal()),
      Store.load('resumes', defaultResumes())
    ]);
    while (resumes.length < MIN_RESUMES) resumes.push(newResume());
    ensureFallback();
    loaded = true;

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

  // Autosave. Each effect reads its whole state via $state.snapshot, so any nested change re-runs it.
  $effect(() => { if (loaded) Store.saveSoon('prefs', $state.snapshot(prefs)); });
  $effect(() => { if (loaded) Store.saveSoon('settings', { ...$state.snapshot(settings), aiTest: 'idle' }); });
  $effect(() => { if (loaded) Store.saveSoon('personal', $state.snapshot(personal)); });
  $effect(() => { if (loaded) Store.saveSoon('resumes', $state.snapshot(resumes)); });

  // There's no "All" tab anymore: clicking the active tile again goes back to all.
  function selectTile(key) { activeStatus = activeStatus === key ? 'all' : key; }

  // Tile sparklines: postings per day (by postedAt) over the last 6 days, as bar-height %.
  const SPARK_DAYS = 6;
  let sparkBars = $derived.by(() => {
    const out = {};
    const now = Date.now();
    for (const t of STATUS_TILES) {
      const buckets = new Array(SPARK_DAYS).fill(0);
      for (const j of jobs) {
        if (j.status !== t.key || !j.postedAt) continue;
        const age = Math.floor((now - new Date(j.postedAt).getTime()) / DAY_MS);
        if (age >= 0 && age < SPARK_DAYS) buckets[SPARK_DAYS - 1 - age]++;
      }
      const max = Math.max(1, ...buckets);
      out[t.key] = buckets.map((n) => Math.max(12, Math.round((n / max) * 100)));
    }
    return out;
  });

  function formatRaw(raw) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw ?? 'No raw data stored.'; }
  }

  function stampFor(job) {
    if (job.status === 'new') {
      const isRecent = job.postedAt && Date.now() - new Date(job.postedAt).getTime() < THREE_DAYS_MS;
      return isRecent ? { label: 'New' } : null;
    }
    if (job.status === 'rejected') return { label: 'Rejected' };
    if (job.status === 'applied') return { label: 'Applied' };
    return null;
  }

  // ---- Modals: only one is ever open, so a single value tracks which ----
  let activeModal = $state(null); // a key of MODAL_TITLES, or null when nothing is open
  let modalNode = $state(null);
  let wipeTarget = $state(null);  // 'personal' | 'postings' | null — which button is armed
  let wiping = $state(null);      // 'personal' | 'postings' | null — which is in flight
  let wipeError = $state('');
  let wipeConfirmTimeout;

  function openModal(name) {
    if (!loaded && NEEDS_LOAD_MODALS.includes(name)) return;
    activeModal = name;
  }

  function closeModal() {
    activeModal = null;
    wipeTarget = null;
    wipeError = '';
    clearTimeout(wipeConfirmTimeout);
  }

  $effect(() => {
    if (!activeModal) return;
    function onKey(e) { if (e.key === 'Escape') closeModal(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    if (activeModal && modalNode) modalNode.focus();
  });

  let activeStatus = $state('all');
  let expandedIds = $state(new Set());
  let rawOpenIds = $state(new Set());
  let filters = $state({ remoteOnly: false, salaryListed: false, postedThisWeek: false });

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
    openModal('filters');
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
    closeModal();
    runFilterPass();
  }

  function runFilterPass() {
    loadingState = 'filtering';
    // TODO: recompute filteredJobs / message background using appliedFilterState
    // (postedWithin, salary/hourly range, workType, include/exclude keywords, AI filter)
    // Placeholder timing until the real query/scoring pass exists.
    setTimeout(() => { loadingState = 'idle'; }, 3200);
  }

  function clearDraftFilters() {
    draftFilterState = defaultFilterState();
  }

  const DEFAULT_FILTERS = defaultFilterState();

  // Mutate the applied filters directly (used by the chip ×), then re-run the pass.
  function editApplied(fn) { fn(appliedFilterState); runFilterPass(); }

  function clearAllFilters() {
    filters = { remoteOnly: false, salaryListed: false, postedThisWeek: false };
    appliedFilterState = defaultFilterState();
    runFilterPass();
  }

  // One chip per active filter. The bar wraps onto a second line as this grows.
  let activeChips = $derived.by(() => {
    const s = appliedFilterState;
    const d = DEFAULT_FILTERS;
    const chips = [];

    for (const q of QUICK_FILTERS) {
      if (filters[q.key]) chips.push({ id: q.key, label: q.label, tone: q.tone, remove: () => toggleFilter(q.key) });
    }
    if (s.postedWithin !== 'any') {
      chips.push({
        id: 'posted', tone: 'blue',
        label: `Posted: ${POSTED_WITHIN.find((o) => o.key === s.postedWithin)?.label}`,
        remove: () => editApplied((a) => (a.postedWithin = 'any'))
      });
    }
    const compChanged = s.compType === 'salary'
      ? s.salaryMin !== d.salaryMin || s.salaryMax !== d.salaryMax
      : s.hourlyMin !== d.hourlyMin || s.hourlyMax !== d.hourlyMax;
    if (compChanged) {
      chips.push({
        id: 'comp', tone: 'amber',
        label: s.compType === 'salary'
          ? `$${Math.round(s.salaryMin/1000)}k–${Math.round(s.salaryMax/1000)}k`
          : `$${Math.round(s.hourlyMin)}–${Math.round(s.hourlyMax)}/hr`,
        remove: () => editApplied((a) => {
          a.salaryMin = d.salaryMin; a.salaryMax = d.salaryMax;
          a.hourlyMin = d.hourlyMin; a.hourlyMax = d.hourlyMax;
        })
      });
    }
    const wt = WORK_TYPES.filter((w) => s.workType[w.key]);
    if (wt.length < WORK_TYPES.length) {
      chips.push({
        id: 'work', tone: 'teal',
        label: wt.length ? wt.map((w) => w.label).join(' + ') : 'No work types',
        remove: () => editApplied((a) => (a.workType = { ...d.workType }))
      });
    }
    s.includeKeywords.forEach((kw, i) => chips.push({
      id: `inc-${i}-${kw}`, tone: 'green', label: `+ ${kw}`,
      remove: () => editApplied((a) => a.includeKeywords.splice(i, 1))
    }));
    s.excludeKeywords.forEach((kw, i) => chips.push({
      id: `exc-${i}-${kw}`, tone: 'red', label: `− ${kw}`,
      remove: () => editApplied((a) => a.excludeKeywords.splice(i, 1))
    }));
    if (s.aiFilterEnabled && s.aiFilterPrompt.trim()) {
      const p = s.aiFilterPrompt.trim();
      chips.push({
        id: 'ai', tone: 'violet', label: `AI: ${p.length > 28 ? p.slice(0, 28) + '…' : p}`,
        remove: () => editApplied((a) => (a.aiFilterEnabled = false))
      });
    }
    return chips;
  });

  // Multi-select
  let selectedIds = $state(new Set());

  const SIDEBAR_WIDTH_EXPANDED = 240;
  const SIDEBAR_WIDTH_COLLAPSED = 56;
  let sidebarCollapsed = $state(false);

  // ---- Edit personal info ----
  let newContactLabel = $state('');
  let newContactValue = $state('');

  function addCustomContact() {
    const value = newContactValue.trim();
    if (!value) return;
    personal.customContacts = [...personal.customContacts, { id: crypto.randomUUID(), label: newContactLabel.trim() || 'Custom', value }];
    newContactLabel = '';
    newContactValue = '';
  }

  function removeCustomContact(id) {
    personal.customContacts = personal.customContacts.filter((c) => c.id !== id);
  }

  function addSchool() { personal.schools = [...personal.schools, newSchool()]; }
  function removeSchool(id) { personal.schools = personal.schools.filter((s) => s.id !== id); }
  function addJob() { personal.workHistory = [...personal.workHistory, newJob()]; }
  function removeJob(id) { personal.workHistory = personal.workHistory.filter((j) => j.id !== id); }

  // start/end are native <input type="month"> values ("YYYY-MM"), so no date parsing needed.
  function monthsBetween(start, end) {
    if (!start) return 0;
    const [sy, sm] = start.split('-').map(Number);
    const now = new Date();
    const [ey, em] = end ? end.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
    return Math.max(0, (ey - sy) * 12 + (em - sm));
  }

  const QUARTER_FRACTIONS = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };
  function formatYearsFraction(years) {
    const rounded = Math.round(years * 4) / 4;
    const whole = Math.floor(rounded);
    const frac = QUARTER_FRACTIONS[+(rounded - whole).toFixed(2)] ?? '';
    return whole === 0 && frac ? frac : `${whole}${frac ? ' ' + frac : ''}`;
  }

  let experienceYears = $derived(personal.workHistory.reduce((sum, j) => sum + monthsBetween(j.start, j.end), 0) / 12);
  let experienceDisplay = $derived(formatYearsFraction(experienceYears));

  // Reuses addingKey / addValue from the Questions pills. Enter keeps the input open for rapid entry.
  function commitSkill(keepOpen = false) {
    const value = addValue.trim();
    if (value && !personal.skills.includes(value)) personal.skills = [...personal.skills, value];
    addValue = '';
    if (!keepOpen) addingKey = null;
  }
  function removeSkill(index) { personal.skills = personal.skills.filter((_, i) => i !== index); }

  let personalSection = $state('basic'); // 'basic' | 'questions'

  function isAnswered(q) {
    const a = personal.answers[q.id];
    if (q.kind === 'open' || q.kind === 'bonus') return a.trim() !== '';
    if (q.kind === 'star') return Object.values(a).some((v) => v.trim() !== '');
    if (q.kind === 'pills') return a.length > 0;
    if (q.kind === 'one') return a.value !== '';
    return a.passions.length > 0 || a.prefs.length > 0; // dual
  }
  let answeredCount = $derived(QUESTIONS.filter(isAnswered).length);

  // ---- Edit personal info: Basic tab status ----
  let basicStatus = $derived.by(() => {
    const p = personal;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const nSchools = p.schools.filter((s) => s.name.trim()).length;
    const nJobs = p.workHistory.filter((j) => j.company.trim()).length;
    const anyContact = Object.values(p.contacts).some((v) => v.trim()) || p.customContacts.length > 0;
    const extrasDone = Boolean(
      p.workAuth.trim() || p.startDate.trim() || p.relocation ||
      p.eeoc.gender.trim() || p.eeoc.race || p.eeoc.veteran.trim() || p.eeoc.disability.trim()
    );
    const identityDone = !!(p.name.trim() && p.dob);
    return {
      identity:   { done: identityDone, text: identityDone ? 'Done' : 'To do' },
      contacts:   { done: anyContact, text: anyContact ? 'Done' : 'To do' },
      education:  { done: nSchools > 0, text: nSchools ? plural(nSchools, 'school') : 'To do' },
      work:       { done: nJobs > 0, text: nJobs ? plural(nJobs, 'job') : 'To do' },
      experience: { done: experienceYears > 0 || p.experienceOverride.trim() !== '', text: 'Calculated from Work Experience' },
      skills:     { done: p.skills.length > 0, text: p.skills.length ? `${p.skills.length} added` : 'To do' },
      extras:     { done: extrasDone, text: extrasDone ? 'Done' : 'Optional' }
    };
  });
  let sectionsDone = $derived(Object.values(basicStatus).filter((s) => s.done).length);

  // ---- Edit preferences ----
  function prefLabel(key) {
    return PREF_FIELDS[key].options.find((o) => o.value === prefs[key])?.label;
  }
  function cyclePref(key) {
    const { options } = PREF_FIELDS[key];
    const i = options.findIndex((o) => o.value === prefs[key]);
    prefs[key] = options[(i + 1) % options.length].value;
  }

  // Pill groups store their picks at holder[key]: an array (multi) or a string (single).
  // Custom pills live only in that value, so they show up while selected and vanish if deselected.
  function selectedOf(holder, key, single) {
    return single ? (holder[key] ? [holder[key]] : []) : holder[key];
  }
  function optionsWithCustom(options, selected) {
    return [...options, ...selected.filter((v) => !options.includes(v))];
  }
  function togglePill(holder, key, single, value) {
    if (single) holder[key] = holder[key] === value ? '' : value;
    else holder[key] = holder[key].includes(value) ? holder[key].filter((v) => v !== value) : [...holder[key], value];
  }

  let addingKey = $state(null); // which group's "+ add" is currently an input
  let addValue = $state('');
  function startAdd(groupKey) { addingKey = groupKey; addValue = ''; }
  function cancelAdd() { addValue = ''; addingKey = null; }
  function commitAdd(holder, key, single) {
    const value = addValue.trim();
    if (value) {
      if (single) holder[key] = value;
      else if (!holder[key].includes(value)) holder[key] = [...holder[key], value];
    }
    cancelAdd();
  }
  function focusOnMount(node) { node.focus(); }

  function statusCount(key) {
    if (key === 'all') return jobs.length;
    return jobs.filter((j) => j.status === key).length;
  }

  // Sources filter: options come from the built-in sources plus any custom ones the user named.
  let sourceSearch = $state('');
  let sourceOptions = $derived([
    ...SOURCE_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    ...settings.customSources.filter((c) => c.name.trim()).map((c) => ({ key: c.id, label: c.name.trim() }))
  ]);
  let visibleSources = $derived(
    sourceOptions.filter((o) => o.label.toLowerCase().includes(sourceSearch.trim().toLowerCase()))
  );
  function toggleSource(key) {
    const p = draftFilterState.sources.picked;
    draftFilterState.sources.picked = p.includes(key) ? p.filter((k) => k !== key) : [...p, key];
  }

  let searchQuery = $state('');

  let sortBy = $state('best');
  let sortOpen = $state(false);
  let sortNode = $state(null);

  const timeOf = (j) => (j.postedAt ? new Date(j.postedAt).getTime() || 0 : 0);
  const payOf = (j) => annualRange(j)?.hi ?? -1;
  const SORTERS = {
    // matchScore (0–100) is optional until the scoring pass exists; unscored jobs fall back to newest.
    best: (a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1) || timeOf(b) - timeOf(a),
    // TODO: ask the background for an AI ranking and cache it. Until then this matches 'best'.
    ai: (a, b) => SORTERS.best(a, b),
    pay: (a, b) => payOf(b) - payOf(a) || timeOf(b) - timeOf(a),
    newest: (a, b) => timeOf(b) - timeOf(a)
  };
  function pickSort(key) { sortBy = key; sortOpen = false; }
  function onWindowClick(e) { if (sortOpen && sortNode && !sortNode.contains(e.target)) sortOpen = false; }

  let filteredJobs = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * DAY_MS;
    return jobs
      .filter((j) => {
        if (activeStatus !== 'all' && j.status !== activeStatus) return false;
        if (filters.remoteOnly && j.workType !== 2) return false;
        if (filters.salaryListed && annualRange(j) == null) return false;
        if (filters.postedThisWeek && timeOf(j) < weekAgo) return false;
        if (q && !`${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(SORTERS[sortBy]);
  });

  // "You apply" (top N) → automation band → everything else.
  let splitView = $derived(activeStatus === 'all' || OPEN_STATUSES.includes(activeStatus));
  let openJobs = $derived(splitView ? filteredJobs.filter((j) => OPEN_STATUSES.includes(j.status)) : []);
  let manualJobs = $derived(openJobs.slice(0, MANUAL_COUNT));
  let handoffJobs = $derived(openJobs.slice(MANUAL_COUNT));
  let handledJobs = $derived(splitView ? filteredJobs.filter((j) => !OPEN_STATUSES.includes(j.status)) : filteredJobs);

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

  // ---- Pay bar: job range drawn against your applied pay range (annualized) ----
  let payDomain = $derived.by(() => {
    const s = appliedFilterState;
    const lo = s.compType === 'hourly' ? hourlyToSalary(s.hourlyMin) : s.salaryMin;
    const hi = s.compType === 'hourly' ? hourlyToSalary(s.hourlyMax) : s.salaryMax;
    return { lo, hi: Math.max(hi, lo + 1) };
  });
  let idealAnnual = $derived(
    appliedFilterState.compType === 'hourly' ? hourlyToSalary(appliedFilterState.idealPay) : appliedFilterState.idealPay
  );
  function payPct(v) {
    const { lo, hi } = payDomain;
    return Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  }

  // ---- Card actions ----
  const act = (fn) => (e) => { e.stopPropagation(); fn(); };
  function setStatus(ids, status) {
    const idSet = new Set(ids);
    jobs = jobs.map((j) => (idSet.has(j.id) ? { ...j, status } : j));
    // TODO: chrome.runtime.sendMessage({ type: 'postings:setStatus', ids: [...idSet], status })
  }
  function toggleShortlist(job) { setStatus([job.id], job.status === 'shortlisted' ? 'new' : 'shortlisted'); }
  function openPosting(job) {
    if (job.url) window.open(job.url, '_blank', 'noopener'); // adjust to your field name for the Adzuna redirect URL
    // TODO: track it (e.g. "Did you apply?" prompt, or mark Applied when the tab closes).
  }

  // ---- Removing postings (animated) ----
  // Ids currently being deleted. The collapse transition only plays for these, so a card
  // that merely moves between the top-3 / hand-off / handled groups doesn't animate out.
  function collapse(node, { id, duration = 260 }) {
    if (!removingIds.has(id)) return { duration: 0 };
    const h = node.offsetHeight;
    const GAP = 10; // must match .content-flow gap
    return {
      duration,
      easing: cubicOut,
      css: (t) => `overflow: hidden; height: ${t * h}px; margin-bottom: ${-(1 - t) * GAP}px; opacity: ${t};`
    };
  }

  function removeJobs(ids) {
    const idSet = new Set(ids);
    removingIds = new Set([...removingIds, ...idSet]);
    setTimeout(() => {
      jobs = jobs.filter((j) => !idSet.has(j.id));
      selectedIds = new Set([...selectedIds].filter((id) => !idSet.has(id)));
    }, STALL_DELETIONS_MS);
    setTimeout(() => {
      removingIds = new Set([...removingIds].filter((id) => !idSet.has(id)));
    }, STALL_DELETIONS_MS + 500);
  }

  function deleteJobs(ids) {
    // chrome.runtime.sendMessage({ type: 'postings:deleteJobs', ids })
    removeJobs(ids);
  }

  // Fixed topbar height is dynamic (the filter bar can wrap), so the list offsets from it.
  let topbarH = $state(0);

  // "You've reached the end" only makes sense once the page actually scrolls.
  let winH = $state(0);      // window.innerHeight
  let contentH = $state(0);  // height of .content-flow
  const END_BUFFER_PX = 200; // how far past one screen the page must run before the message appears
  const PAGE_CHROME_PX = 76; // .content-flow margins: 16px above + 60px below
  let showEnd = $derived(
    filteredJobs.length > 0 && topbarH + contentH + PAGE_CHROME_PX > winH + END_BUFFER_PX
  );

  // ---- Automation run (drives the Begin Applying button + hover popup) ----
  // null when idle. TODO: have the background push this while a run is active.
  let run = $state(null); // { done, total, company, title, step, unresolved }
  function pauseRun() {}  // TODO
  function stopRun() {}   // TODO

  function formatCompact(value) {
    const rounded = Math.round(value);
    if (Math.abs(rounded) < 1000) return String(rounded);
    const thousands = rounded / 1000;
    // Whole thousands stay as "60k"; anything in between gets one decimal, e.g. "62.5k".
    const trimmed = Number.isInteger(thousands) ? thousands : Math.round(thousands * 10) / 10;
    return `${trimmed}k`;
  }

  // Annualized pay range for sorting, filtering and the pay bar. Hourly-only postings use the hours-per-year constant.
  function annualRange(job) {
    let lo = job.minSalary ?? job.maxSalary;
    let hi = job.maxSalary ?? job.minSalary;
    if (lo == null) {
      const hLo = job.minHourly ?? job.maxHourly;
      const hHi = job.maxHourly ?? job.minHourly;
      if (hLo == null) return null;
      lo = hLo * HOURS_PER_YEAR;
      hi = hHi * HOURS_PER_YEAR;
    }
    return { lo, hi };
  }

  // Short card text. Annual figures use "60k–80k"; hourly-only postings use "25–32/hr".
  function formatSalary(job) {
    const min = job.minSalary ?? job.maxSalary;
    const max = job.maxSalary ?? job.minSalary;
    if (min != null) return min === max ? Math.round(min).toLocaleString() : `${formatCompact(min)}–${formatCompact(max)}`;
    const hMin = job.minHourly ?? job.maxHourly;
    const hMax = job.maxHourly ?? job.minHourly;
    if (hMin == null) return null;
    const f = (v) => String(Math.round(v * 100) / 100);
    return `${hMin === hMax ? f(hMin) : `${f(hMin)}–${f(hMax)}`}/hr`;
  }

  const WORK_TYPE_NAMES = ['Unknown', 'On-site', 'Remote', 'Hybrid'];
  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  function formatDate(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
  }

  function formatMoney(value, currency, digits = 0) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: digits
      }).format(value);
    } catch { return Math.round(value).toLocaleString(); }
  }

  function formatRange(min, max, fmt) {
    const lo = min ?? max;
    const hi = max ?? min;
    if (lo == null) return null;
    return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  // Rows for the info panel. Anything missing is skipped, so the panel only shows what exists.
  function detailRows(job) {
    const rows = [];
    const add = (label, value, href) => { if (value != null && value !== '') rows.push({ label, value, href }); };
    add('Company', job.company);
    add('Location', job.location);
    add('Work type', job.workType > 0 ? WORK_TYPE_NAMES[job.workType] : null);
    add('Employment', job.employmentType ? titleCase(job.employmentType) : null);
    const annual = formatRange(job.minSalary, job.maxSalary, (v) => formatMoney(v, job.currency));
    const hourly = formatRange(job.minHourly, job.maxHourly, (v) => formatMoney(v, job.currency, 2));
    add('Salary', annual && `${annual} / year`);
    add('Hourly', hourly && `${hourly} / hour`);
    add('Posted', formatDate(job.postedAt));
    add('Fetched', formatDate(job.fetchedAt));
    add('Source', job.source);
    add('Status', job.status ? titleCase(job.status) : null);
    add('Shortlisted', formatDate(job.shortlistedAt));
    add('Applied', formatDate(job.appliedAt));
    add('Filtered out', formatDate(job.filteredOutAt));
    add('Posting', job.url ? hostOf(job.url) : null, job.url);
    return rows;
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

  function handleSelectAllClick() {
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
    removeJobs([...selectedIds]);
    selectedIds = new Set();
  }

  function deleteSelected() {
    deleteJobs([...selectedIds]);
    selectedIds = new Set();
  }

  // TODO: kick off the automation pipeline (call this from the apply modal's start button)
  function beginApplying() {}

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }

  // ---- Resumes ----
  // Resume shape: { id, title, sim: string[], fileName, fb }

  // Compare titles ignoring case, punctuation, Sr./Jr. and front-end / front end / frontend.
  function normTitle(s) {
    return s.toLowerCase().replace(/[.,]/g, '')
      .replace(/\bsr\b/g, 'senior').replace(/\bjr\b/g, 'junior')
      .replace(/\b(front|back|full)[\s-]?(end|stack)\b/g, '$1$2')
      .replace(/-/g, '').replace(/\s+/g, ' ').trim();
  }
  const resumeTitles = (r) => [r.title, ...r.sim].filter((t) => t.trim());

  // normalized title → resumes that contain it
  let titleOwners = $derived.by(() => {
    const map = new Map();
    for (const r of resumes) {
      for (const key of new Set(resumeTitles(r).map(normTitle))) {
        map.set(key, [...(map.get(key) ?? []), r]);
      }
    }
    return map;
  });
  function otherOwners(r, title) {
    const key = normTitle(title);
    if (!key) return [];
    return (titleOwners.get(key) ?? []).filter((q) => q.id !== r.id);
  }
  const isDuplicate = (r, title) => otherOwners(r, title).length > 0;
  const dupNames = (r, title) => otherOwners(r, title).map((q) => q.title.trim() || 'Untitled').join(', ');
  let sharedTitleCount = $derived([...titleOwners.values()].filter((o) => o.length > 1).length);

  // One flat list of every title, colored by the resume it belongs to.
  let coverageChips = $derived(
    resumes
      .flatMap((r, i) =>
        resumeTitles(r).map((t, j) => ({
          key: `${r.id}-${j}`,
          title: t,
          resume: r,
          color: RESUME_COLORS[i % RESUME_COLORS.length]
        }))
      )
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  );

  let resumeError = $state('');
  let dragOverId = $state(null);

  function addResume() {
    resumes = [...resumes, newResume(resumes.length === 0)];
  }

  function removeResume(id) {
    resumes = resumes.filter((r) => r.id !== id);
    while (resumes.length < MIN_RESUMES) resumes.push(newResume());
    ensureFallback();
    Store.deleteResumeFile(id);
  }

  function setFallback(id) {
    resumes.forEach((r) => (r.fb = r.id === id));
  }
  function ensureFallback() {
    if (resumes.length && !resumes.some((r) => r.fb)) resumes[0].fb = true;
  }

  // Accepts "A, B; C" or pasted lines. Skips titles that already exist on this resume.
  function addResumeTags(id, raw) {
    const r = resumes.find((x) => x.id === id);
    if (!r) return;
    for (const v of raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
      if (!r.sim.some((x) => normTitle(x) === normTitle(v))) r.sim.push(v);
    }
  }
  function removeResumeTag(id, index) {
    resumes.find((r) => r.id === id)?.sim.splice(index, 1);
  }
  function handleResumeTagKeydown(id, e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addResumeTags(id, e.currentTarget.value);
      e.currentTarget.value = '';
    }
  }
  function handleResumeTagPaste(id, e) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (/[,;\n]/.test(text)) {
      e.preventDefault();
      addResumeTags(id, text);
    }
  }
  function handleResumeTagBlur(id, e) {
    if (e.currentTarget.value.trim()) addResumeTags(id, e.currentTarget.value);
    e.currentTarget.value = '';
  }
  // Escape closes a focused tooltip without also closing the whole modal.
  function closeTip(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); }
  }

  function setResumeFile(id, file) {
    const r = resumes.find((x) => x.id === id);
    if (!r || !file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) { resumeError = 'Please choose a PDF, DOC or DOCX file.'; return; }
    resumeError = '';
    r.fileName = file.name;
    Store.putResumeFile(id, file);
  }
  function onResumePick(id, e) {
    setResumeFile(id, e.currentTarget.files?.[0]);
    e.currentTarget.value = '';
  }
  function onResumeDrop(id, e) {
    e.preventDefault();
    dragOverId = null;
    setResumeFile(id, e.dataTransfer?.files?.[0]);
  }
  function clearResumeFile(id) {
    const r = resumes.find((x) => x.id === id);
    if (r) r.fileName = '';
    Store.deleteResumeFile(id);
  }

  // ---- Settings ----
  let showKeys = $state({});

  // Hero meter: [count, total, label] per section
  const onCount = (items) => items.filter((item) => {
    const [key, parent] = Array.isArray(item) ? item : [item];
    return settings[key] && (!parent || settings[parent]);
  }).length;
  let settingsMeter = $derived.by(() => {
    const tokens = [...SOURCE_FIELDS.map((f) => settings.tokens[f.key]), ...settings.customSources.map((c) => c.token)];
    return {
      src:    [tokens.filter((v) => (v ?? '').trim()).length, tokens.length, 'connected'],
      ai:     [settings.aiTest === 'ok' ? 1 : 0, 1, 'connected'],
      email:  [onCount(['emailAccess', ['readOnStartup', 'emailAccess'], ['autoStatus', 'emailAccess']]), 3, 'on'],
      auto:   [onCount(['pauseCaptcha', 'skipApplied']), 2, 'on'],
      alerts: [onCount(['notif', ['nReview', 'notif'], ['nMatch', 'notif'], ['nSkip', 'notif'], ['quiet', 'notif']]), 5, 'on'],
      data:   [onCount(['deleteOld', ['keepApplied', 'deleteOld'], 'storeRaw']), 3, 'on']
    };
  });

  function addSource() {
    settings.customSources.push({ id: crypto.randomUUID(), name: '', token: '' });
  }
  function removeSource(id) {
    settings.customSources = settings.customSources.filter((c) => c.id !== id);
  }

  function pickProvider(i) {
    settings.aiProvider = i;
    settings.aiModel = AI_MODELS[i][0] ?? '';
  }
  // Any change to what would be tested invalidates the last result.
  $effect(() => {
    settings.aiProvider; settings.aiModel; settings.aiUrl;
    settings.tokens['ai' + settings.aiProvider];
    settings.aiTest = 'idle';
  });
  async function testAiConnection() {
    settings.aiTest = 'busy';
    try {
      // TODO: handle 'ai:test' in the background service worker. It makes the request, so keys never reach page scripts.
      const response = await chrome.runtime.sendMessage({
        type: 'ai:test',
        provider: settings.aiProvider,
        model: settings.aiModel,
        baseUrl: settings.aiUrl,
        key: settings.tokens['ai' + settings.aiProvider]
      });
      settings.aiTest = response?.ok ? 'ok' : 'fail';
    } catch {
      settings.aiTest = 'fail';
    }
  }

  function clampDeleteDays(e) {
    const n = Math.round(Number(e.currentTarget.value));
    settings.deleteDays = Math.min(365, Math.max(1, n || 60));
    e.currentTarget.value = settings.deleteDays;
  }
  // TODO: wire these to real background messages.
  function exportData() {}
  function clearCache() {}

  // Scroll-spy: the section overlapping the top quarter of the panel is the active one.
  let settingsPanelNode = $state(null);
  let settingsActive = $state('src');
  let settingsLock = false; // ignore the observer while a click-to-jump scroll is animating
  let settingsLockTimeout;

  $effect(() => {
    if (activeModal !== 'settings' || !settingsPanelNode) return;
    const visible = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.dataset.sec);
          else visible.delete(e.target.dataset.sec);
        }
        if (settingsLock) return;
        const first = SETTINGS_SECTIONS.find((s) => visible.has(s.id));
        if (first) settingsActive = first.id;
      },
      { root: settingsPanelNode, rootMargin: '0px 0px -75% 0px' }
    );
    settingsPanelNode.querySelectorAll('[data-sec]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  });

  function jumpToSection(id) {
    const el = settingsPanelNode?.querySelector(`[data-sec="${id}"]`);
    if (!el) return;
    settingsActive = id;
    settingsLock = true;
    clearTimeout(settingsLockTimeout);
    settingsLockTimeout = setTimeout(() => (settingsLock = false), 700);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    settingsPanelNode.scrollTo({ top: el.offsetTop - 2, behavior: reduce ? 'auto' : 'smooth' });
  }

  function requestWipe(target) {
    if (wipeTarget !== target) {
      wipeTarget = target;
      clearTimeout(wipeConfirmTimeout);
      wipeConfirmTimeout = setTimeout(() => (wipeTarget = null), 4000);
      return;
    }
    performWipe(target);
  }

  async function performWipe(target) {
    clearTimeout(wipeConfirmTimeout);
    wipeTarget = null;
    wiping = target;
    wipeError = '';
    try {
      if (target === 'postings') {
        const response = await chrome.runtime.sendMessage({ type: 'postings:wipeJobs' });
        if (!response.ok) throw new Error(response.error);
        jobs = [];
        selectedIds = new Set();
        expandedIds = new Set();
        rawOpenIds = new Set();
        activeModal = null;
      } else if (target === 'personal') {
        await Store.remove('personal', 'prefs');
        personal = defaultPersonal();
        prefs = defaultPrefs();
      }
    } catch (err) {
      wipeError = err.message;
    } finally {
      wiping = null;
    }
  }
</script>

  {#snippet pillGroup(qid, holder, key, options, single = false)}
    {@const selected = selectedOf(holder, key, single)}
    {@const groupKey = `${qid}:${key}`}
    <div class="q-pills" role="group" aria-labelledby="q-title-{qid}">
      {#each optionsWithCustom(options, selected) as opt}
        <button type="button" class="q-pill" class:on={selected.includes(opt)} onclick={() => togglePill(holder, key, single, opt)}>{opt}</button>
      {/each}
      {#if addingKey === groupKey}
        <input
          class="q-pill-input"
          bind:value={addValue}
          use:focusOnMount
          placeholder="add..."
          aria-label="Add option"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitAdd(holder, key, single); }
            else if (e.key === 'Escape') { e.stopPropagation(); cancelAdd(); }
          }}
          onblur={() => commitAdd(holder, key, single)}
        />
      {:else}
        <button type="button" class="q-pill add" onclick={() => startAdd(groupKey)}>+ add</button>
      {/if}
    </div>
  {/snippet}
  {#snippet sectionHead(n, title, status, sub)}
    <span class="bs-node" aria-hidden="true">{n}</span>
    <h4 class="bs-title">{title}<span class="bs-status" class:done={status.done}>{status.text}</span></h4>
    {#if sub}<p class="bs-sub">{sub}</p>{/if}
  {/snippet}
  {#snippet prefHeader(title, color, icon)}
    <div class="pf-head" style="--c: {color}">
      <span class="pf-head-icon" aria-hidden="true">{@html icon}</span>{title}
    </div>
  {/snippet}
  {#snippet prefPill(key)}
    <span
      class="pf-pill"
      style="--c: {PREF_FIELDS[key].color}"
      role="button"
      tabindex="0"
      title="Click to change"
      onclick={() => cyclePref(key)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cyclePref(key); } }}
    >{prefLabel(key)}</span>
  {/snippet}
  {#snippet fsHead(title, badge)}
    <summary class="fs-head">
      <span class="fs-dot" aria-hidden="true"></span>
      <b>{title}</b>
      <em>{badge}</em>
      <span class="fs-chev" aria-hidden="true">{@html chevronIcon}</span>
    </summary>
  {/snippet}
  {#snippet jobCard(job, variant, rank)}
    {@const stamp = stampFor(job)}
    {@const salary = formatSalary(job)}
    <div
      class="job-card {variant}"
      class:top={rank === 0}
      class:closed={job.status === 'rejected' || job.status === 'filtered_out'}
      class:selected={selectedIds.has(job.id)}
    >
      <div
        class="job-row"
        role="button"
        tabindex="0"
        aria-expanded={expandedIds.has(job.id)}
        onclick={() => toggleExpanded(job.id)}
        onkeydown={(e) => {
          if (e.target !== e.currentTarget) return; // don't hijack keys from the checkbox/buttons inside
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(job.id); }
        }}
      >
        <input class="job-checkbox" type="checkbox" checked={selectedIds.has(job.id)} onclick={(e) => toggleSelect(job.id, e)} aria-label="Select posting" />
        {#if variant === 'manual'}
          <span class="job-rank" style="--rk: {CARD_COLORS[rank % CARD_COLORS.length]}" aria-label="Rank {rank + 1}">{rank + 1}</span>
        {/if}
        {#if job.matchScore != null}
          <div class="match-ring" style="--p: {job.matchScore}; --rc: {job.matchScore >= 80 ? 'var(--shortlist)' : 'var(--bonus)'}" title="Match score">
            <span>{Math.round(job.matchScore)}</span>
          </div>
        {/if}
        <div class="job-main">
          <div class="job-title-row">
            <p class="job-title">{job.title}</p>
            {#if stamp}
              <span class="job-label job-label-{job.status}">{stamp.label}</span>
            {/if}
          </div>
          <p class="job-meta">{[job.company, job.location, formatDate(job.postedAt) && `posted ${formatDate(job.postedAt)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div class="job-salary-col">
          <div class="job-salary">
            {#if salary}
              <span class="salary-flag" title="Listed by the source">✓</span>
              <span class="salary-dollar">$</span>
              <span class="salary-amount">{salary}</span>
            {:else}
              <span class="salary-amount muted">not listed</span>
            {/if}
          </div>
          {#if salary}
            {@const range = annualRange(job)}
            {@const lo = payPct(range.lo)}
            {@const hi = payPct(range.hi)}
            <div class="pay-bar" aria-hidden="true">
              <i class="pay-bar-fill" style="left: {lo}%; right: {100 - hi}%;"></i>
              {#if appliedFilterState.idealPayEnabled}
                <em class="pay-bar-ideal" style="left: {payPct(idealAnnual)}%;"></em>
              {/if}
            </div>
          {/if}
        </div>
        <div class="job-actions">
          <button class="job-act shortlist" class:on={job.status === 'shortlisted'} aria-pressed={job.status === 'shortlisted'} aria-label="Shortlist" title="Mark Shortlisted" onclick={act(() => toggleShortlist(job))}>{@html starIcon}</button>
          <button class="job-act reject" aria-label="Delete" title="Delete" onclick={act(() => deleteJobs([job.id]))}>{@html closeIcon}</button>
          <button class="job-apply" onclick={act(() => openPosting(job))}>Apply ↗</button>
        </div>
        <span class="chevron" class:open={expandedIds.has(job.id)}>{@html chevronIcon}</span>
      </div>

      {#if expandedIds.has(job.id)}
        <div class="job-detail">
          <button class="icon-btn raw-btn" onclick={() => toggleRaw(job.id)} aria-label="View raw data" title="View raw data">
            {@html questionMarkIcon}
          </button>
          <div class="job-detail-body">
            <div class="job-detail-cols">
              <div class="job-desc-box" title="Drag the bottom-right corner to resize">
                {#if job.description}
                  <p class="job-description">{job.description}</p>
                {:else}
                  <p class="job-description muted">No description provided.</p>
                {/if}
              </div>
              <dl class="job-info">
                {#each detailRows(job) as row (row.label)}
                  <div class="job-info-row">
                    <dt>{row.label}</dt>
                    <dd>
                      {#if row.href}
                        <a href={row.href} target="_blank" rel="noopener noreferrer">{row.value} ↗</a>
                      {:else}{row.value}{/if}
                    </dd>
                  </div>
                {/each}
              </dl>
            </div>
            {#if rawOpenIds.has(job.id)}
              <pre class="raw-json">{formatRaw(job.raw)}</pre>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/snippet}
  {#snippet stSwitch(key, label)}
    <button type="button" class="st-sw" class:on={settings[key]} role="switch" aria-checked={settings[key]} aria-label={label}
      onclick={() => (settings[key] = !settings[key])}></button>
  {/snippet}

  {#snippet stSeg(key, options, onpick)}
    <div class="st-sg" role="group">
      {#each options as o, n}
        <button type="button" class="st-so" class:on={settings[key] === n} aria-pressed={settings[key] === n}
          onclick={() => (onpick ? onpick(n) : (settings[key] = n))}>{o}</button>
      {/each}
    </div>
  {/snippet}

  {#snippet stToken(holder, key, id, placeholder, label)}
    <div class="st-tok">
      <input class="st-input mono" type={showKeys[id] ? 'text' : 'password'} bind:value={holder[key]}
        {placeholder} aria-label={label} autocomplete="off" spellcheck="false" />
      <button type="button" class="st-eb" onclick={() => (showKeys[id] = !showKeys[id])}>{showKeys[id] ? 'Hide' : 'Show'}</button>
      <span class="st-stp" class:ok={(holder[key] ?? '').trim() !== ''}>{(holder[key] ?? '').trim() ? 'Key set' : 'Not set'}</span>
    </div>
  {/snippet}

  {#snippet stHero(s)}
    {@const m = settingsMeter[s.id]}
    <div class="st-hero">
      <b>{s.title}</b>
      <p>{s.desc}</p>
      <div class="st-meter"><i style="width: {m[1] ? (m[0] / m[1]) * 100 : 0}%"></i></div>
      <small>{m[0]} OF {m[1]} {m[2].toUpperCase()}</small>
    </div>
  {/snippet}

  <svelte:window
    bind:innerHeight={winH}
    onclick={onWindowClick}
    onkeydown={(e) => { if (e.key === 'Escape') sortOpen = false; }}
    onpagehide={Store.flush}
  />

  <div class="postings-page" class:font-large={prefs.size === 'large'} style="--sidebar-w: {sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px; --topbar-h: {topbarH}px;">
  <div class="fixed-topbar" bind:clientHeight={topbarH}>
    <div class="topbar-search">
      <input class="search-input" type="search" bind:value={searchQuery} placeholder="Search title, company, location…" aria-label="Search postings" />
    </div>

    <div class="status-tiles">
      {#each STATUS_TILES as tile (tile.key)}
        <button class="status-tile" class:active={activeStatus === tile.key} style="--t: {tile.color}" aria-pressed={activeStatus === tile.key} onclick={() => selectTile(tile.key)}>
          <span class="tile-head"><span class="tile-icon">{@html tile.icon}</span>{tile.label}</span>
          <b class="tile-count">{statusCount(tile.key)}</b>
          <span class="tile-spark" aria-hidden="true">
            {#each sparkBars[tile.key] as h}<i style="height: {h}%"></i>{/each}
          </span>
        </button>
      {/each}
    </div>

    <div class="filters-bar">
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
        <button class="filters-btn" class:active={activeModal === 'filters'} onclick={openFilterMenu}>
          {@html filterIcon}Filters
          {#if activeChips.length > 0}<span class="filters-count">{activeChips.length}</span>{/if}
        </button>
        {#each activeChips as chip (chip.id)}
          <span class="fchip fchip-{chip.tone}">
            {chip.label}
            <button class="fchip-x" onclick={chip.remove} aria-label="Remove filter: {chip.label}">×</button>
          </span>
        {/each}
        {#each QUICK_FILTERS.filter((q) => !filters[q.key]) as q (q.key)}
          <button class="fchip fchip-ghost fchip-{q.tone}" onclick={() => toggleFilter(q.key)}>+ {q.label}</button>
        {/each}
        {#if activeChips.length > 1}
          <button class="fchip-clear" onclick={clearAllFilters}>Clear all</button>
        {/if}
      {/if}
    </div>
  </div>

  <div class="top-actions">
    <button
      class="fetch-jobs-btn"
      onclick={() => openModal('fetch')}
      aria-label="Fetch Jobs"
      title="Fetch Jobs"
    >
      {@html syncIcon}
      Fetch Jobs
    </button>
    <div class="apply-wrap">
      <button
        class="begin-applying-btn"
        class:running={run}
        onclick={() => openModal('apply')}
        aria-label={run ? `Applying, ${run.done} of ${run.total} done` : 'Begin Applying'}
        title={run ? undefined : 'Begin Applying'}
      >
        {#if run}
          <span class="spin-icon">{@html syncIcon}</span>Applying… {run.done}/{run.total}
        {:else}
          {@html applyIcon}Begin Applying
        {/if}
      </button>
      {#if run}
        <div class="run-pop" role="status">
          <div class="run-pop-card">
            <div class="run-pop-head"><span class="run-live"></span><b>Applying · running</b></div>
            <div>
              <p class="run-pop-company">{run.company}</p>
              <p class="run-pop-title">{run.title}</p>
            </div>
            <div class="run-bar"><i style="width: {(run.done / run.total) * 100}%"></i></div>
            <div class="run-row">
              <span>{run.done} of {run.total} postings</span>
              {#if run.unresolved}<span class="run-warn">{run.unresolved} unresolved</span>{/if}
            </div>
            <div class="run-row"><span>Now</span><b>{run.step}</b></div>
            <div class="run-btns">
              <button class="run-btn" onclick={pauseRun}>Pause</button>
              <button class="run-btn stop" onclick={stopRun}>Stop</button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
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
        <button class="sidebar-btn" onclick={() => openModal('personal')}>
          <span class="sb-ic" style="--ic: var(--new)">{@html userIcon}</span>
          <span class="sidebar-label">Edit personal info</span>
        </button>
        <button class="sidebar-btn" onclick={() => openModal('preferences')}>
          <span class="sb-ic" style="--ic: var(--shortlist)">{@html preferencesIcon}</span>
          <span class="sidebar-label">Edit preferences</span>
        </button>
      </div>

      <div class="sidebar-section">
        <button class="sidebar-btn sidebar-btn-outline" onclick={() => openModal('resumes')}>
          <span class="sb-ic" style="--ic: var(--applied)">{@html uploadIcon}</span>
          <span class="sidebar-label" style="flex:1;">Upload resume</span>
          {#if resumes.some((r) => r.fileName)}
            <span class="sidebar-count sidebar-label">{resumes.filter((r) => r.fileName).length}</span>
          {/if}
        </button>
      </div>

      <div class="sidebar-divider"></div>

      <div class="sidebar-section sidebar-section-plain">
        <button class="sidebar-btn" title="View archived">
          <span class="sb-ic" style="--ic: var(--bonus)">{@html archiveIcon}</span>
          <span class="sidebar-label">View archived</span>
        </button>
        <button class="sidebar-btn" onclick={() => openModal('settings')}>
          <span class="sb-ic" style="--ic: var(--slate)">{@html settingsIcon}</span>
          <span class="sidebar-label">Settings</span>
        </button>
        <button class="sidebar-btn" onclick={() => openModal('help')}>
          <span class="sb-ic" style="--ic: var(--violet)">{@html questionMarkIcon}</span>
          <span class="sidebar-label">Help</span>
        </button>
      </div>

      <p class="sidebar-stat sidebar-label">{jobs.length} postings tracked this week</p>
    </div>

    <p class="sidebar-version sidebar-label">v0.4.2</p>
  </aside>

  {#if activeModal}
    <!-- Escape is handled globally by the $effect above, so the backdrop only needs a click handler. -->
    <div
      class="filter-menu-backdrop"
      role="presentation"
      onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      <div
        class="detail-modals"
        class:modal-large={LARGE_MODALS.includes(activeModal)}
        class:modal-medium={!LARGE_MODALS.includes(activeModal)}
        role="dialog"
        aria-modal="true"
        aria-label={MODAL_TITLES[activeModal]}
        tabindex="-1"
        bind:this={modalNode}
      >
        <div class="filter-popup-header" class:help-header={activeModal === 'help'}>
          {#if activeModal === 'help'}
            <span class="help-qmark" aria-hidden="true">?</span>
          {:else}
            <span>{MODAL_TITLES[activeModal]}</span>
          {/if}
          <button class="icon-btn filter-popup-close" onclick={closeModal} aria-label="Close">
            {@html closeIcon}
          </button>
        </div>

        {#if activeModal === 'filters'}
          <div class="fl-body">
            <details class="fs" open style="--c: var(--new)">
              {@render fsHead('Posted within', POSTED_WITHIN.find((o) => o.key === draftFilterState.postedWithin)?.label)}
              <div class="fs-body">
                <div class="pill-row">
                  {#each POSTED_WITHIN as opt}
                    <button class="pill-toggle" class:active={draftFilterState.postedWithin === opt.key} onclick={() => (draftFilterState.postedWithin = opt.key)}>
                      {opt.label}
                    </button>
                  {/each}
                </div>
              </div>
            </details>

            <details class="fs" open style="--c: var(--bonus)">
              {@render fsHead('Compensation', `${compBounds().prefix}${formatComp(compMinValue())}–${compBounds().prefix}${formatComp(compMaxValue())}`)}
              <div class="fs-body">
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
                      }}
                    />
                  </span>
                </label>
                {#if draftFilterState.idealPayEnabled}
                  <p class="filter-hint">Drag the marker to influence sort, not filtering. Currently {compBounds().prefix}{formatComp(draftFilterState.idealPay)}.</p>
                {/if}
              </div>
            </details>

            <details class="fs" open style="--c: var(--shortlist)">
              {@render fsHead('Work type', Object.values(draftFilterState.workType).every(Boolean) ? 'All' : `${Object.values(draftFilterState.workType).filter(Boolean).length} of 4`)}
              <div class="fs-body">
                <div class="work-type-grid">
                  {#each WORK_TYPES as wt}
                    <label class="work-type-item">
                      <input type="checkbox" checked={draftFilterState.workType[wt.key]} onchange={() => toggleWorkType(wt.key)} />
                      {wt.label}
                    </label>
                  {/each}
                </div>
              </div>
            </details>

            <details class="fs" open style="--c: var(--applied)">
              {@render fsHead('Keywords', `${draftFilterState.includeKeywords.length} include, ${draftFilterState.excludeKeywords.length} exclude`)}
              <div class="fs-body">
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
            </details>

            <details class="fs" open style="--c: var(--violet)">
              {@render fsHead('AI filter', draftFilterState.aiFilterEnabled ? 'On' : 'Off')}
              <div class="fs-body">
                <label class="ideal-toggle-row">
                  <span>Classify postings with an AI model</span>
                  <span class="toggle-switch" class:on={draftFilterState.aiFilterEnabled}>
                    <input type="checkbox" class="sr-only-checkbox" checked={draftFilterState.aiFilterEnabled}
                      onchange={() => (draftFilterState.aiFilterEnabled = !draftFilterState.aiFilterEnabled)} />
                  </span>
                </label>
                {#if draftFilterState.aiFilterEnabled}
                  <textarea class="ai-filter-textarea" bind:value={draftFilterState.aiFilterPrompt}
                    placeholder="e.g. exclude anything requiring a security clearance"></textarea>
                  <p class="filter-hint">Sends job descriptions to an AI model to classify against this prompt.</p>
                {/if}
              </div>
            </details>
            <details class="fs" open style="--c: var(--rejected)">
              {@render fsHead('Sources', draftFilterState.sources.mode === 'all' ? 'All' : `${draftFilterState.sources.picked.length} of ${sourceOptions.length}`)}
              <div class="fs-body">
                <div class="pill-row">
                  <button class="pill-toggle" class:active={draftFilterState.sources.mode === 'all'} onclick={() => (draftFilterState.sources.mode = 'all')}>All sources</button>
                  <button class="pill-toggle" class:active={draftFilterState.sources.mode === 'custom'} onclick={() => (draftFilterState.sources.mode = 'custom')}>Custom</button>
                </div>
                {#if draftFilterState.sources.mode === 'custom'}
                  <div class="src-tools">
                    <input class="src-search" type="search" bind:value={sourceSearch} placeholder="Search sources…" aria-label="Search sources" />
                    <button class="chip" onclick={() => (draftFilterState.sources.picked = sourceOptions.map((o) => o.key))}>Select all</button>
                    <button class="chip" onclick={() => (draftFilterState.sources.picked = [])}>None</button>
                  </div>
                  <div class="src-grid">
                    {#each visibleSources as o (o.key)}
                      <label><input type="checkbox" checked={draftFilterState.sources.picked.includes(o.key)} onchange={() => toggleSource(o.key)} />{o.label}</label>
                    {:else}
                      <p class="filter-hint">No sources match.</p>
                    {/each}
                  </div>
                {/if}
              </div>
            </details>
          </div>

          <div class="filter-popup-footer">
            <button class="chip" onclick={clearDraftFilters}>Clear all</button>
            <button class="chip apply-btn" onclick={applyFilters}>Apply</button>
          </div>

        {:else if activeModal === 'personal'}
          <div class="pi-tip">
            <span class="help-qmark" aria-hidden="true">?</span>
            <p>{personalSection === 'basic'
              ? 'This data is used by the form autofiller. The more accurate and complete it is, the better your applications get filled out.'
              : 'Answers you enter will be used to fill open-ended questions with AI inference. Pre-made templates ensure quality responses.'}</p>
          </div>
          <div class="pi-switch">
            <button type="button" class="pi-switch-btn" class:on={personalSection === 'basic'} aria-pressed={personalSection === 'basic'} onclick={() => (personalSection = 'basic')}>Basic</button>
            <button type="button" class="pi-switch-btn" class:on={personalSection === 'questions'} aria-pressed={personalSection === 'questions'} onclick={() => (personalSection = 'questions')}>Questions</button>
          </div>

          {#if personalSection === 'basic'}
            <div class="q-progress-label">{sectionsDone} of {BASIC_TOTAL} sections complete</div>
            <div class="q-progress"><i style="width: {(sectionsDone / BASIC_TOTAL) * 100}%"></i></div>

            <div class="pi-body">
              <div class="bs-rail">
                <!-- 1 Identity -->
                <div class="bs" style="--c: var(--new)">
                  {@render sectionHead(1, 'Identity', basicStatus.identity)}
                  <div class="field-grid">
                    <div class="field"><label for="pi-name">Full name</label><input id="pi-name" bind:value={personal.name} /></div>
                    <div class="field"><label for="pi-dob">Date of birth</label><input id="pi-dob" type="date" bind:value={personal.dob} /></div>
                  </div>
                </div>

                <!-- 2 Contacts -->
                <div class="bs" style="--c: var(--shortlist)">
                  {@render sectionHead(2, 'Contacts', basicStatus.contacts)}
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-email">Email</label>
                    <input id="pi-contact-email" class="contact-input" bind:value={personal.contacts.email} placeholder="you@example.com" />
                    <span class="contact-spacer"></span>
                  </div>
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-phone">Phone</label>
                    <input id="pi-contact-phone" class="contact-input" bind:value={personal.contacts.phone} placeholder="(555) 010-2938" />
                    <span class="contact-spacer"></span>
                  </div>
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-linkedin">LinkedIn</label>
                    <input id="pi-contact-linkedin" class="contact-input" bind:value={personal.contacts.linkedin} placeholder="linkedin.com/in/you" />
                    <span class="contact-spacer"></span>
                  </div>
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-github">GitHub</label>
                    <input id="pi-contact-github" class="contact-input" bind:value={personal.contacts.github} placeholder="github.com/you" />
                    <span class="contact-spacer"></span>
                  </div>
                  {#each personal.customContacts as c (c.id)}
                    <div class="contact-row">
                      <input class="contact-input contact-label-input" bind:value={c.label} />
                      <input class="contact-input" bind:value={c.value} />
                      <button class="contact-remove" onclick={() => removeCustomContact(c.id)} aria-label="Remove {c.label}">×</button>
                    </div>
                  {/each}
                  <div class="contact-row">
                    <input class="contact-input contact-label-input" bind:value={newContactLabel} placeholder="Custom" />
                    <input
                      class="contact-input"
                      bind:value={newContactValue}
                      placeholder="value"
                      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomContact(); } }}
                    />
                    <button class="contact-add" onclick={addCustomContact} aria-label="Add contact">+</button>
                  </div>
                </div>

                <!-- 3 Education -->
                <div class="bs" style="--c: var(--applied)">
                  {@render sectionHead(3, 'Education', basicStatus.education, 'Add every school you attended')}
                  {#each personal.schools as school (school.id)}
                    <div class="entry-card">
                      {#if personal.schools.length > 1}
                        <button class="entry-remove" onclick={() => removeSchool(school.id)}>Remove</button>
                      {/if}
                      <div class="entry-row full"><div class="field"><label for="school-name-{school.id}">School</label><input id="school-name-{school.id}" bind:value={school.name} /></div></div>
                      <div class="entry-row">
                        <div class="field"><label for="school-start-{school.id}">Started</label><input id="school-start-{school.id}" type="month" bind:value={school.start} /></div>
                        <div class="field"><label for="school-end-{school.id}">Graduated <span class="field-optional">— leave blank if ongoing</span></label><input id="school-end-{school.id}" type="month" bind:value={school.end} /></div>
                      </div>
                    </div>
                  {/each}
                  <button class="add-entry-btn" onclick={addSchool}>+ Add another school</button>
                </div>

                <!-- 4 Work experience -->
                <div class="bs" style="--c: var(--bonus)">
                  {@render sectionHead(4, 'Work experience', basicStatus.work, "Add every role you've held")}
                  {#each personal.workHistory as job (job.id)}
                    <div class="entry-card">
                      {#if personal.workHistory.length > 1}
                        <button class="entry-remove" onclick={() => removeJob(job.id)}>Remove</button>
                      {/if}
                      <div class="entry-row">
                        <div class="field"><label for="job-company-{job.id}">Company & title</label><input id="job-company-{job.id}" bind:value={job.company} /></div>
                        <div class="field">
                          <label for="job-type-{job.id}">Employment type</label>
                          <select id="job-type-{job.id}" bind:value={job.type}>
                            <option value="">Select…</option>
                            {#each JOB_TYPES as t}<option value={t}>{t}</option>{/each}
                          </select>
                        </div>
                      </div>
                      <div class="entry-row">
                        <div class="field"><label for="job-start-{job.id}">Started</label><input id="job-start-{job.id}" type="month" bind:value={job.start} /></div>
                        <div class="field"><label for="job-end-{job.id}">Ended <span class="field-optional">— leave blank if ongoing</span></label><input id="job-end-{job.id}" type="month" bind:value={job.end} /></div>
                      </div>
                    </div>
                  {/each}
                  <button class="add-entry-btn" onclick={addJob}>+ Add another job</button>
                </div>

                <!-- 5 Years of experience -->
                <div class="bs" style="--c: var(--new)">
                  {@render sectionHead(5, 'Years of experience', basicStatus.experience)}
                  <div class="exp-row">
                    <span class="exp-auto">{experienceDisplay} years — calculated from work history</span>
                    <span class="exp-override">Override <input bind:value={personal.experienceOverride} placeholder={experienceDisplay} /></span>
                  </div>
                </div>

                <!-- 6 Skills -->
                <div class="bs" style="--c: var(--shortlist)">
                  {@render sectionHead(6, 'Skills & certifications', basicStatus.skills)}
                  {#if personal.skills.length > 0}
                    <div class="q-pills">
                      {#each personal.skills as skill, i}
                        <span class="q-pill on">{skill}<button type="button" class="q-pill-x" onclick={() => removeSkill(i)} aria-label="Remove {skill}">×</button></span>
                      {/each}
                    </div>
                  {/if}
                  <div class="bs-add-line">
                    {#if addingKey === 'skills'}
                      <input
                        class="q-pill-input"
                        bind:value={addValue}
                        use:focusOnMount
                        placeholder="add a skill or certification..."
                        aria-label="Add skill or certification"
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitSkill(true); }
                          else if (e.key === 'Escape') { e.stopPropagation(); cancelAdd(); }
                        }}
                        onblur={() => commitSkill()}
                      />
                    {:else}
                      <button type="button" class="q-pill add" onclick={() => startAdd('skills')}>+ add</button>
                    {/if}
                  </div>
                </div>

                <!-- 7 Extras -->
                <div class="bs" style="--c: var(--applied)">
                  {@render sectionHead(7, 'Extras', basicStatus.extras)}
                  <div class="field-grid">
                    <div class="field"><label for="pi-workauth">Work authorization</label><input id="pi-workauth" bind:value={personal.workAuth} placeholder="e.g. Authorized, no sponsorship needed" /></div>
                    <div class="field"><label for="pi-startdate">Earliest start date</label><input id="pi-startdate" bind:value={personal.startDate} placeholder="e.g. 2 weeks notice" /></div>
                    <div class="field">
                      <span id="pi-relocation-label" class="field-label">Are you willing to relocate?</span>
                      <div class="pill-row" role="group" aria-labelledby="pi-relocation-label">
                        <button type="button" class="pill-toggle" class:active={personal.relocation === 'very_likely'} onclick={() => (personal.relocation = 'very_likely')}>Very likely</button>
                        <button type="button" class="pill-toggle" class:active={personal.relocation === 'no'} onclick={() => (personal.relocation = 'no')}>No</button>
                        <button type="button" class="pill-toggle" class:active={personal.relocation === 'own_country'} onclick={() => (personal.relocation = 'own_country')}>Only in my own country</button>
                      </div>
                    </div>
                  </div>

                  <div class="extras-divider"><span class="extras-label">Voluntary demographic info (EEOC)</span></div>
                  <div class="field-grid">
                    <div class="field"><label for="pi-gender">Gender</label><input id="pi-gender" bind:value={personal.eeoc.gender} /></div>
                    <div class="field">
                      <label for="pi-race">Race / ethnicity</label>
                      <select id="pi-race" bind:value={personal.eeoc.race}>
                        <option value="">Select…</option>
                        {#each RACE_OPTIONS as r}<option value={r}>{r}</option>{/each}
                      </select>
                      {#if personal.eeoc.race === 'Other'}
                        <input bind:value={personal.eeoc.raceOther} placeholder="Please specify" aria-label="Race / ethnicity, other" />
                      {/if}
                    </div>
                    <div class="field"><label for="pi-veteran">Veteran status</label><input id="pi-veteran" bind:value={personal.eeoc.veteran} /></div>
                    <div class="field"><label for="pi-disability">Disability status</label><input id="pi-disability" bind:value={personal.eeoc.disability} /></div>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <div class="q-progress-label">{answeredCount} of {QUESTIONS.length} answered</div>
            <div class="q-progress"><i style="width: {(answeredCount / QUESTIONS.length) * 100}%"></i></div>

            <div class="pi-body">
              {#each QUESTIONS as q, i (q.id)}
                <div class="q-card" style="--c: {q.kind === 'bonus' ? BONUS_COLOR : CARD_COLORS[i % CARD_COLORS.length]}">
                  <h4 class="q-title" id="q-title-{q.id}">
                    <span class="q-num" aria-hidden="true">{q.kind === 'bonus' ? '★' : i + 1}</span>
                    <span>
                      {q.title}
                      {#if q.subtitle}<span class="q-sub">{q.subtitle}</span>{/if}
                    </span>
                    <span class="q-kind">{KIND_LABELS[q.kind]}</span>
                  </h4>

                  {#if q.kind === 'open' || q.kind === 'bonus'}
                    <textarea
                      class="q-textarea"
                      aria-labelledby="q-title-{q.id}"
                      bind:value={personal.answers[q.id]}
                      placeholder={q.placeholder ?? 'Write 2–4 sentences. Specifics beat generalities.'}
                    ></textarea>
                    {#if q.template && !personal.answers[q.id].trim()}
                      <button type="button" class="q-template-btn" onclick={() => (personal.answers[q.id] = q.template)}>✦ Insert starter template</button>
                    {/if}
                  {:else if q.kind === 'star'}
                    <div class="q-star3">
                      {#each STAR_FIELDS as f}
                        <label for="q-{q.id}-{f.key}">{f.label}</label>
                        <textarea id="q-{q.id}-{f.key}" class="q-textarea" bind:value={personal.answers[q.id][f.key]} placeholder={f.placeholder}></textarea>
                      {/each}
                    </div>
                  {:else if q.kind === 'pills'}
                    {@render pillGroup(q.id, personal.answers, q.id, q.options)}
                  {:else if q.kind === 'one'}
                    {@render pillGroup(q.id, personal.answers[q.id], 'value', q.options, true)}
                    {#if q.note}
                      <input class="q-note" bind:value={personal.answers[q.id].note} placeholder="Optional: one line of context" aria-label="Optional context" />
                    {/if}
                  {:else}
                    <div class="q-grp" style="color: var(--new)">Passions</div>
                    <div style="--c: var(--new)">{@render pillGroup(q.id, personal.answers[q.id], 'passions', q.passions)}</div>
                    <div class="q-grp" style="color: var(--shortlist)">Work preferences</div>
                    <div style="--c: var(--shortlist)">{@render pillGroup(q.id, personal.answers[q.id], 'prefs', q.prefs)}</div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else if activeModal === 'preferences'}
          <div class="pf">
            {@render prefHeader('App Customization', 'var(--new)', slidersIcon)}
            <p class="pf-sentence">Use the {@render prefPill('theme')} Theme with a {@render prefPill('size')} font.</p>
            <p class="pf-sentence">Show pay in {@render prefPill('comp')} format.</p>

            {@render prefHeader('Autofiller Preferences', 'var(--shortlist)', boltIcon)}
            <p class="pf-pick">Pick an automation style below</p>
            <div class="pf-auto" role="radiogroup" aria-label="Automation style">
              {#each AUTOMATION_OPTIONS as opt}
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.automation === opt.value}
                  class="pf-auto-opt"
                  class:on={prefs.automation === opt.value}
                  onclick={() => (prefs.automation = opt.value)}
                >
                  <b>{opt.title}</b>
                  <small>{opt.desc}</small>
                </button>
              {/each}
            </div>
            <p class="pf-sentence">Upload the best resume based on {@render prefPill('resume')}.</p>
            <p class="pf-sentence">For open-ended questions, {@render prefPill('open')}.</p>

            {@render prefHeader('Stealth Options', 'var(--bonus)', eyeOffIcon)}
            <p class="pf-sentence">Fill applications {@render prefPill('speed')}.</p>
            <p class="pf-sentence">For cover letters, {@render prefPill('cover')}.</p>
          </div>
        {:else if activeModal === 'resumes'}
          <p class="filter-hint">The autofiller picks a resume by matching job titles.</p>
          {#if resumeError}<p class="filter-hint wipe-error">{resumeError}</p>{/if}

          <div class="rs-map">
            <div class="rs-map-title">Title coverage</div>
            {#if coverageChips.length > 0}
              <div class="rs-map-scroll">
                {#each coverageChips as c (c.key)}
                  <span class="rs-mpill" style="--c: {c.color}" class:dup={isDuplicate(c.resume, c.title)}>{c.title}</span>
                {/each}
              </div>
              <div class="rs-map-foot" class:bad={sharedTitleCount > 0}>
                {#if sharedTitleCount > 0}
                  <span class="rs-tri" aria-hidden="true">{@html warnTriIcon}</span>
                  {sharedTitleCount} shared title{sharedTitleCount === 1 ? '' : 's'} across resumes
                {:else}
                  ✓ Every title belongs to exactly one resume
                {/if}
              </div>
            {:else}
              <p class="rs-map-empty">Currently empty. Add titles to each resume so the autofiller knows which resume to upload to each job posting.</p>
            {/if}
          </div>

          {#each resumes as r, i (r.id)}
            {@const titleDup = isDuplicate(r, r.title)}
            <div class="rs-card" style="--c: {RESUME_COLORS[i % RESUME_COLORS.length]}">
              <div class="rs-head">
                <span class="rs-page" aria-hidden="true">{i + 1}</span>
                <div class="rs-head-main">
                  <label class="rs-head-label" for="rs-title-{r.id}">Use this to apply as a…</label>
                  <div class="rs-title-row">
                    <input
                      id="rs-title-{r.id}"
                      class="rs-title"
                      bind:value={r.title}
                      placeholder="e.g. Frontend Developer"
                      style="width: {Math.max(14, r.title.length + 2)}ch;"
                    />
                    {#if titleDup}
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
                      <span class="rs-tri rs-tri-head" tabindex="0" aria-label="Duplicate title" aria-describedby="rs-tip-title-{r.id}" onkeydown={closeTip}>
                        {@html warnTriIcon}
                        <span class="rs-tip" role="tooltip" id="rs-tip-title-{r.id}">
                          <b>Duplicate title</b>“{r.title}” is also under {dupNames(r, r.title)}. Keep it under one resume so the autofiller can easily choose the best resume for each job posting.
                        </span>
                      </span>
                    {/if}
                  </div>
                </div>
                <button
                  type="button"
                  class="rs-star"
                  class:on={r.fb}
                  aria-pressed={r.fb}
                  aria-label="Fallback resume"
                  aria-describedby="rs-tip-fb-{r.id}"
                  onclick={() => setFallback(r.id)}
                  onkeydown={closeTip}
                >
                  {@html starIcon}
                  <span class="rs-tip rs-tip-fb" role="tooltip" id="rs-tip-fb-{r.id}">
                    <b>{r.fb ? 'Fallback resume' : 'Make this the fallback'}</b>When no resume matches, this one will be used. You can configure to instead skip the posting and be notified via Settings.
                  </span>
                </button>
                <button type="button" class="rs-x" onclick={() => removeResume(r.id)} aria-label="Remove resume" title="Remove resume">×</button>
              </div>

              <div class="rs-body">
                <span class="rs-label">Similar titles this resume also loosely showcases</span>
                <div class="rs-tags">
                  {#each r.sim as t, ti}
                    {@const dup = isDuplicate(r, t)}
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
                    <span
                      class="rs-tag"
                      class:dup
                      tabindex={dup ? 0 : undefined}
                      aria-describedby={dup ? `rs-tip-${r.id}-${ti}` : undefined}
                      onkeydown={dup ? closeTip : undefined}
                    >
                      {t}
                      {#if dup}
                        <span class="rs-tri" aria-hidden="true">{@html warnTriIcon}</span>
                        <span class="rs-tip" role="tooltip" id="rs-tip-{r.id}-{ti}">
                          <b>Duplicate title</b>“{t}” is also under {dupNames(r, t)}. Keep it under one resume so the autofiller can choose the best match.
                        </span>
                      {/if}
                      <button type="button" class="rs-tag-x" onclick={() => removeResumeTag(r.id, ti)} aria-label="Remove {t}">×</button>
                    </span>
                  {/each}
                </div>
                <div class="rs-add-line">
                  <input
                    class="rs-tag-input"
                    placeholder="+ add a title..."
                    aria-label="Add similar title"
                    onkeydown={(e) => handleResumeTagKeydown(r.id, e)}
                    onpaste={(e) => handleResumeTagPaste(r.id, e)}
                    onblur={(e) => handleResumeTagBlur(r.id, e)}
                  />
                </div>

                {#if r.fileName}
                  <div class="rs-file">
                    {@html fileTextIcon}
                    <span class="rs-file-name">{r.fileName}</span>
                    <span class="rs-file-ok">Uploaded</span>
                    <label class="rs-link">Replace<input type="file" accept=".pdf,.doc,.docx" hidden onchange={(e) => onResumePick(r.id, e)} /></label>
                    <button type="button" class="rs-link" onclick={() => clearResumeFile(r.id)}>Remove</button>
                  </div>
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <label
                    class="rs-drop"
                    class:over={dragOverId === r.id}
                    ondragover={(e) => { e.preventDefault(); dragOverId = r.id; }}
                    ondragleave={() => (dragOverId = null)}
                    ondrop={(e) => onResumeDrop(r.id, e)}
                  >
                    {@html uploadIcon}
                    Upload or drop resume <small>PDF, DOC or DOCX</small>
                    <input type="file" accept=".pdf,.doc,.docx" hidden onchange={(e) => onResumePick(r.id, e)} />
                  </label>
                {/if}
              </div>
            </div>
          {:else}
            <p class="note">No resumes yet. Add one to get started.</p>
          {/each}

          <button class="add-entry-btn" onclick={addResume}>+ {resumes.length === 0 ? 'Add a resume' : 'Add another resume'}</button>
        {:else if activeModal === 'fetch'}
          <!-- TODO: fetch modal content -->

        {:else if activeModal === 'apply'}
          <!-- TODO: apply modal content -->

        {:else if activeModal === 'settings'}
          <div class="st-body">
            <nav class="st-rail" aria-label="Settings sections">
              {#each SETTINGS_SECTIONS as s}
                <button type="button" class="st-rb" class:on={settingsActive === s.id} style="--c: {s.color}"
                  aria-current={settingsActive === s.id ? 'true' : undefined} onclick={() => jumpToSection(s.id)}>
                  <span class="st-ic">{@html s.icon}</span>{s.title}
                </button>
              {/each}
            </nav>

            <div class="st-panel" bind:this={settingsPanelNode}>

              <!-- Sources -->
              <section class="st-sec" data-sec="src" style="--c: var(--new)">
                {@render stHero(SEC.src)}
                <div class="st-it">
                  <div class="st-tx"><b>Merge duplicate postings</b><small>The same job from several boards shows once.</small></div>
                  {@render stSwitch('merge', 'Merge duplicate postings')}
                </div>
                {#each SOURCE_FIELDS as f}
                  <div class="st-it stack">
                    <div class="st-tx"><b>{f.label}</b><small>{f.desc}</small></div>
                    <div class="st-ct">{@render stToken(settings.tokens, f.key, f.key, f.placeholder, `${f.label} token`)}</div>
                  </div>
                {/each}
                {#each settings.customSources as c (c.id)}
                  <div class="st-it stack">
                    <div class="st-name-row">
                      <input class="st-input" bind:value={c.name} placeholder="Source name" aria-label="Custom source name" />
                      <button type="button" class="st-rm" onclick={() => removeSource(c.id)} aria-label="Remove source">×</button>
                    </div>
                    <div class="st-ct">{@render stToken(c, 'token', c.id, 'paste token', 'Custom source token')}</div>
                  </div>
                {/each}
                <button type="button" class="st-add" onclick={addSource}>+ Add a source</button>
              </section>

              <!-- AI Model -->
              <section class="st-sec" data-sec="ai" style="--c: var(--applied)">
                {@render stHero(SEC.ai)}
                <div class="st-it stack">
                  <div class="st-tx"><b>Provider</b><small>Ollama runs on your machine, so nothing leaves your device.</small></div>
                  <div class="st-ct">{@render stSeg('aiProvider', AI_PROVIDERS, pickProvider)}</div>
                </div>
                {#if settings.aiProvider !== 3}
                  <div class="st-it stack">
                    <div class="st-tx"><b>API key</b><small>Stored only on this device.</small></div>
                    <div class="st-ct">{@render stToken(settings.tokens, `ai${settings.aiProvider}`, `ai${settings.aiProvider}`, AI_KEY_PLACEHOLDERS[settings.aiProvider], 'API key')}</div>
                  </div>
                {/if}
                {#if settings.aiProvider >= 3}
                  <div class="st-it stack">
                    <div class="st-tx"><b>Base URL</b><small>Where the model is reachable.</small></div>
                    <div class="st-ct"><input class="st-input" bind:value={settings.aiUrl} placeholder="http://localhost:11434" aria-label="Base URL" /></div>
                  </div>
                {/if}
                <div class="st-it stack">
                  <div class="st-tx"><b>Model</b><small>Type a name or pick a suggestion.</small></div>
                  <div class="st-ct">
                    <input class="st-input" list="st-models" bind:value={settings.aiModel} placeholder="model name" aria-label="Model" />
                    <datalist id="st-models">{#each AI_MODELS[settings.aiProvider] as m}<option value={m}></option>{/each}</datalist>
                  </div>
                </div>
                <div class="st-it stack">
                  <div class="st-tx"><b>Connection</b><small>Sends one tiny request to check your key and model.</small></div>
                  <div class="st-ct st-tst">
                    <button type="button" class="st-eb" onclick={testAiConnection} disabled={settings.aiTest === 'busy'}>Test connection</button>
                    <span class="st-stp {AI_TEST_LABELS[settings.aiTest][1]}">{AI_TEST_LABELS[settings.aiTest][0]}</span>
                  </div>
                </div>
                <div class="st-it">
                  <div class="st-tx"><b>Answer open-ended questions</b><small>Follows your Preferences choices.</small></div>
                  {@render stSwitch('aiOpen', 'Answer open-ended questions')}
                </div>
                <div class="st-it">
                  <div class="st-tx"><b>Power the AI filter</b><small>Classifies postings against your prompt.</small></div>
                  {@render stSwitch('aiFilter', 'Power the AI filter')}
                </div>
                <div class="st-it">
                  <div class="st-tx"><b>Pick a resume when unsure</b><small>Used when Preferences say let AI decide.</small></div>
                  {@render stSwitch('aiPick', 'Pick a resume when unsure')}
                </div>
              </section>

              <!-- Email -->
              <section class="st-sec" data-sec="email" style="--c: var(--shortlist)">
                {@render stHero(SEC.email)}
                <div class="st-it">
                  <div class="st-tx"><b>Email access</b><small>Lets Job Sorter read replies to your applications.</small></div>
                  {@render stSwitch('emailAccess', 'Email access')}
                </div>
                  <div class="st-it stack cond">
                    <div class="st-tx"><b>Email address</b></div>
                    <div class="st-ct">
                      <div class="st-em">
                        <input class="st-input st-em-user" bind:value={settings.emailUser} placeholder="your.dummy.name" aria-label="Email username" />
                        <span class="st-at">@</span>
                        <select class="st-input" bind:value={settings.emailDomain} aria-label="Email provider">
                          {#each EMAIL_DOMAINS as d, n}<option value={n}>{d}</option>{/each}
                        </select>
                        {#if settings.emailDomain === EMAIL_OTHER}
                          <input class="st-input" bind:value={settings.emailCustom} placeholder="yourdomain.com" aria-label="Custom domain" />
                        {/if}
                      </div>
                      <div class="st-callout">
                        {@html shieldCheckIcon}
                        <span><b>Use a dummy email.</b> Recruiters and job boards share and leak addresses, so a throwaway made just for job hunting keeps your main inbox free of spam.</span>
                      </div>
                    </div>
                  </div>
                  <div class="st-group" class:st-off={!settings.emailAccess} inert={!settings.emailAccess}>
                  <div class="st-it cond">
                    <div class="st-tx"><b>Read emails on startup</b><small>Checks for new replies whenever the extension opens.</small></div>
                    {@render stSwitch('readOnStartup', 'Read emails on startup')}
                  </div>
                  <div class="st-it stack cond">
                    <div class="st-tx"><b>Stay up to date</b><small>How far back the AI should read emails.</small></div>
                    <div class="st-ct">{@render stSeg('scanDays', ['7 days', '30 days', '90 days'])}</div>
                  </div>
                  <div class="st-it cond">
                    <div class="st-tx"><b>Update status from replies</b><small>Marks postings Rejected or Applied for you.</small></div>
                    {@render stSwitch('autoStatus', 'Update status from replies')}
                  </div>
                </div>
              </section>

              <!-- Automation -->
              <section class="st-sec" data-sec="auto" style="--c: var(--bonus)">
                {@render stHero(SEC.auto)}
                <div class="st-it stack">
                  <div class="st-tx"><b>When no resume matches</b><small>Use your fallback resume, or skip the posting and get notified.</small></div>
                  <div class="st-ct">{@render stSeg('noMatch', ['Use fallback resume', 'Skip and notify me'])}</div>
                </div>
                <div class="st-it stack">
                  <div class="st-tx"><b>Max applications per day</b><small>Keeps your activity looking human. 0 means no limit.</small></div>
                  <div class="st-ct">
                    <div class="st-rg">
                      <input type="range" min="0" max="100" bind:value={settings.dailyLimit} aria-label="Max applications per day" />
                      <span class="st-val">{settings.dailyLimit === 0 ? 'No limit' : `${settings.dailyLimit} / day`}</span>
                    </div>
                  </div>
                </div>
                <div class="st-it stack">
                  <div class="st-tx"><b>Auto-fetch jobs</b></div>
                  <div class="st-ct">{@render stSeg('autoFetch', ['Off', 'Hourly', 'Every 6h', 'Daily'])}</div>
                </div>
                <div class="st-it">
                  <div class="st-tx"><b>Pause on CAPTCHA</b><small>Stops and asks you instead of guessing.</small></div>
                  {@render stSwitch('pauseCaptcha', 'Pause on CAPTCHA')}
                </div>
                <div class="st-it">
                  <div class="st-tx"><b>Skip companies I applied to</b><small>Avoids double applications.</small></div>
                  {@render stSwitch('skipApplied', 'Skip companies I applied to')}
                </div>
              </section>

              <!-- Alerts -->
              <section class="st-sec" data-sec="alerts" style="--c: var(--new)">
                {@render stHero(SEC.alerts)}
                <div class="st-it">
                  <div class="st-tx"><b>Desktop notifications</b><small>Show alerts outside the browser.</small></div>
                  {@render stSwitch('notif', 'Desktop notifications')}
                </div>
                <div class="st-group" class:st-off={!settings.notif} inert={!settings.notif}>
                  <div class="st-it cond">
                    <div class="st-tx"><b>Application needs review</b><small>When the autofiller is unsure.</small></div>
                    {@render stSwitch('nReview', 'Application needs review')}
                  </div>
                  <div class="st-it cond">
                    <div class="st-tx"><b>New postings match my titles</b><small>Based on your resume titles.</small></div>
                    {@render stSwitch('nMatch', 'New postings match my titles')}
                  </div>
                  <div class="st-it cond">
                    <div class="st-tx"><b>A posting was skipped</b><small>Such as no resume match.</small></div>
                    {@render stSwitch('nSkip', 'A posting was skipped')}
                  </div>
                </div>
                <div class="st-it stack">
                  <div class="st-tx"><b>Activity summary</b></div>
                  <div class="st-ct">{@render stSeg('digest', ['Off', 'Daily', 'Weekly'])}</div>
                </div>
                <div class="st-group" class:st-off={!settings.notif} inert={!settings.notif}>
                  <div class="st-it cond">
                    <div class="st-tx"><b>Quiet hours</b><small>Hold notifications overnight.</small></div>
                    {@render stSwitch('quiet', 'Quiet hours')}
                  </div>
                  <div class="st-it stack cond" class:st-off={!settings.quiet} inert={!settings.quiet}>
                      <div class="st-tx"><b>Quiet hours window</b></div>
                      <div class="st-ct st-tm">
                        <input class="st-input" type="time" bind:value={settings.quietFrom} aria-label="Quiet hours start" /> to
                        <input class="st-input" type="time" bind:value={settings.quietTo} aria-label="Quiet hours end" />
                      </div>
                    </div>
                  </div>
              </section>

              <!-- Data -->
              <section class="st-sec" data-sec="data" style="--c: var(--rejected)">
                {@render stHero(SEC.data)}
                <div class="st-it">
                  <div class="st-tx"><b>Delete old postings</b><small>Automatically remove postings after a set time.</small></div>
                  {@render stSwitch('deleteOld', 'Delete old postings')}
                </div>
                <div class="st-group" class:st-off={!settings.deleteOld} inert={!settings.deleteOld}>
                  <div class="st-it cond">
                    <div class="st-tx"><b>Time before deletion</b></div>
                    <span class="st-nm">
                      <input class="st-input" type="number" min="1" max="365" value={settings.deleteDays} onchange={clampDeleteDays} aria-label="Days before deletion" /> days
                    </span>
                  </div>
                  <div class="st-it cond">
                    <div class="st-tx"><b>Keep applied postings</b><small>Never auto-delete ones you applied to.</small></div>
                    {@render stSwitch('keepApplied', 'Keep applied postings')}
                  </div>
                </div>
                <div class="st-it">
                  <div class="st-tx"><b>Store raw posting data</b><small>Needed for the "?" viewer. Turn off to save space.</small></div>
                  {@render stSwitch('storeRaw', 'Store raw posting data')}
                </div>
                <div class="st-it stack">
                  <div class="st-tx"><b>Your data</b></div>
                  <div class="st-ct st-acts">
                    <button type="button" class="st-eb" onclick={exportData}>Export data</button>
                    <button type="button" class="st-eb" onclick={clearCache}>Clear cache</button>
                  </div>
                </div>
              </section>

            </div>
          </div>
        {:else if activeModal === 'help'}
          <div class="help-hero">
            <span class="help-gh-badge">
              {@html githubIcon}
            </span>
            <h2 class="help-heading">Have any questions?<br>Let me know.</h2>
            <p class="help-subtext">Job Sorter is open source. File a bug, request a feature, or just say hi.</p>
            <a class="help-gh-cta" href="https://github.com/alexirez/Job-Sorter-for-Chrome" target="_blank" rel="noopener noreferrer">
              {@html githubIcon}
              View on GitHub
            </a>
            <!-- Fixed placeholder for now — swap for a real last-fetch/last-commit
                 timestamp once one exists, and branch dot color/label off staleness. -->
            <span class="help-status-pill" title="Last updated: September 2026">
              <span class="help-status-dot"></span>
              Actively maintained
            </span>
          </div>

          <div class="help-data-processing">
            <p class="help-section-heading">Data processing</p>
            <p class="help-data-text">
              Your data is stored only on your own device. AI features are run locally, and only
              data you agree to share will be given out. This can be configured in
              <button class="help-inline-link" onclick={() => openModal('preferences')}>Edit preferences</button>.
            </p>
          </div>

          <div class="help-start-over">
            <p class="help-section-heading">Start over</p>
            <p class="filter-hint" style="margin:0 0 12px;">These actions can't be undone.</p>

            <button
              class="help-action-btn"
              class:confirming={wipeTarget === 'personal'}
              disabled={wiping === 'personal'}
              onclick={() => requestWipe('personal')}
            >
              <span class="action-title">
                {#if wiping === 'personal'}Wiping…
                {:else if wipeTarget === 'personal'}Click again to confirm
                {:else}Wipe personal info{/if}
              </span>
              {#if wipeTarget !== 'personal' && wiping !== 'personal'}
                <span class="action-desc">Clears your saved name, contact details, and preferences.</span>
              {/if}
            </button>

            <button
              class="help-action-btn danger"
              class:confirming={wipeTarget === 'postings'}
              disabled={wiping === 'postings'}
              onclick={() => requestWipe('postings')}
            >
              <span class="action-title">
                {#if wiping === 'postings'}Wiping…
                {:else if wipeTarget === 'postings'}Click again to confirm
                {:else}Wipe job postings{/if}
              </span>
              {#if wipeTarget !== 'postings' && wiping !== 'postings'}
                <span class="action-desc">Deletes every stored posting and resets the database.</span>
              {/if}
            </button>

            {#if wipeError}
              <p class="filter-hint wipe-error">Couldn't wipe: {wipeError}</p>
            {/if}
          </div>
        {/if}

        {#if SAVEABLE_MODALS.includes(activeModal)}
          <div class="filter-popup-footer">
            <button class="chip" onclick={closeModal}>Close</button>
            <button class="chip apply-btn" onclick={closeModal}>Save changes</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="content-flow" bind:clientHeight={contentH}>
    {#if loadingState === 'loading'}
      <p class="note note-empty">Loading postings…</p>
    {:else if loadError}
      <p class="note note-empty">Couldn't load postings: {loadError}</p>
    {:else}
      <header class="list-head">
        {#if splitView && manualJobs.length > 0}
          <b>1 · You apply</b>
          <span class="list-head-note">Top {manualJobs.length} by {SORT_OPTIONS.find((o) => o.key === sortBy).label.toLowerCase()}. Apply ↗ opens the posting.</span>
        {:else}
          <span>{filteredJobs.length} posting{filteredJobs.length === 1 ? '' : 's'}</span>
        {/if}
        <div class="sort" bind:this={sortNode}>
          <button class="sort-btn" aria-haspopup="listbox" aria-expanded={sortOpen} onclick={() => (sortOpen = !sortOpen)}>
            <span class="sort-label">Sort by:</span>
            {SORT_OPTIONS.find((o) => o.key === sortBy).label}
            <span aria-hidden="true">▾</span>
          </button>
          {#if sortOpen}
            <div class="sort-menu" role="listbox" aria-label="Sort by">
              {#each SORT_OPTIONS as o (o.key)}
                <button class="sort-opt" class:on={sortBy === o.key} role="option" aria-selected={sortBy === o.key} onclick={() => pickSort(o.key)}>{o.label}</button>
              {/each}
            </div>
          {/if}
        </div>
      </header>

      {#if splitView}
        {#each manualJobs as job, i (job.id)}
          <div class="job-wrap" class:pending={removingIds.has(job.id)} out:collapse={{ id: job.id }}>{@render jobCard(job, 'manual', i)}</div>
        {/each}

        {#if handoffJobs.length > 0}
          <aside class="handoff-band">
            <span class="handoff-icon" aria-hidden="true">{@html syncIcon}</span>
            <div class="handoff-text">
              <p class="handoff-title">2 · Hand off the other {handoffJobs.length} to automation</p>
              <p class="handoff-sub">Everything below this line uses your preferences and resume tags. Unresolved fields get flagged.</p>
            </div>
            <!-- TODO: beginApplying should receive handoffJobs ids -->
            <button class="handoff-btn" onclick={() => openModal('apply')}>Begin Applying</button>
          </aside>
          {#each handoffJobs as job (job.id)}
            <div class="job-wrap" class:pending={removingIds.has(job.id)} out:collapse={{ id: job.id }}>{@render jobCard(job, 'handoff')}</div>
          {/each}
        {/if}

        {#if handledJobs.length > 0}
          <p class="list-divider">Already handled</p>
        {/if}
      {/if}

      {#each handledJobs as job (job.id)}
        <div class="job-wrap" class:pending={removingIds.has(job.id)} out:collapse={{ id: job.id }}>{@render jobCard(job, 'plain')}</div>
      {/each}

      {#if filteredJobs.length === 0}
        <p class="note note-empty">No postings match the current filters.</p>
      {/if}
      {#if filteredJobs.length > 0}
        <p class="end-of-list" class:hidden={!showEnd} aria-hidden={!showEnd}>You've reached the end.</p>
      {/if}
    {/if}
  </div>
</div>
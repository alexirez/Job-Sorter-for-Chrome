<script>
  import { onMount } from 'svelte';
  import {
     questionMarkIcon, filterIcon, chevronIcon, deleteIcon, archiveIcon,
     applyIcon, uploadIcon, chevronsIcon, userIcon, preferencesIcon,
     settingsIcon, fileTextIcon, slidersIcon, boltIcon, eyeOffIcon, 
     starIcon, warnTriIcon
  } from '../ui/assets/icons';
  import './postings.css';
  import { cubicOut } from 'svelte/easing';

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

  // Inline icons for anything not in ../ui/assets/icons yet.
  const mkSvg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const sparkleIcon = mkSvg('<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>');
  const planeIcon = mkSvg('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>');
  const rejectIcon = mkSvg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>');
  const closeIcon = mkSvg('<path d="M6 6l12 12M18 6L6 18"/>');
  const refreshIcon = mkSvg('<path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5"/>');

  const STATUS_TILES = [
    { key: 'new', label: 'New', icon: sparkleIcon, color: 'var(--new)' },
    { key: 'shortlisted', label: 'Shortlisted', icon: starIcon, color: 'var(--shortlist)' },
    { key: 'applied', label: 'Applied', icon: planeIcon, color: 'var(--applied)' },
    { key: 'rejected', label: 'Rejected', icon: rejectIcon, color: 'var(--rejected)' }
  ];
  // There's no "All" tab anymore: clicking the active tile again goes back to all.
  function selectTile(key) { activeStatus = activeStatus === key ? 'all' : key; }

  const QUICK_FILTERS = [
    { key: 'remoteOnly', label: 'Remote only', tone: 'teal' },
    { key: 'salaryListed', label: 'Salary listed', tone: 'amber' },
    { key: 'postedThisWeek', label: 'Posted this week', tone: 'blue' }
  ];

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

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOURS_PER_YEAR = 2080;
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
  const MODAL_TITLES = {
    filters: 'Filters',
    personal: 'Edit personal info',
    preferences: 'Edit preferences',
    resumes: 'Resumes',
    fetch: 'Fetch jobs',
    apply: 'Begin applying',
    settings: 'Settings',
    help: 'Help'
  };
  const SAVEABLE_MODALS = ['personal', 'preferences', 'resumes'];
  const LARGE_MODALS = ['personal', 'preferences', 'resumes'];

  let activeModal = $state(null); // a key of MODAL_TITLES, or null when nothing is open
  let modalNode = $state(null);
  let wipeTarget = $state(null);  // 'personal' | 'postings' | null — which button is armed
  let wiping = $state(null);      // 'personal' | 'postings' | null — which is in flight
  let wipeError = $state('');
  let wipeConfirmTimeout;

  function openModal(name) {
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
          ? `$${formatCompact(s.salaryMin)}–${formatCompact(s.salaryMax)}`
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
  let resumes = $state([]);

  // ---- Edit personal info: state ----
  let personalName = $state('');
  let personalDob = $state('');

  let contacts = $state({ email: '', phone: '', linkedin: '', github: '' });
  let customContacts = $state([]); // { id, label, value }
  let newContactLabel = $state('');
  let newContactValue = $state('');

  function addCustomContact() {
    const value = newContactValue.trim();
    if (!value) return;
    customContacts = [...customContacts, { id: crypto.randomUUID(), label: newContactLabel.trim() || 'Custom', value }];
    newContactLabel = '';
    newContactValue = '';
  }

  function removeCustomContact(id) {
    customContacts = customContacts.filter((c) => c.id !== id);
  }

  let schools = $state([{ id: crypto.randomUUID(), name: '', start: '', end: '' }]);
  let workHistory = $state([{ id: crypto.randomUUID(), company: '', type: '', start: '', end: '' }]);

  function addSchool() { schools = [...schools, { id: crypto.randomUUID(), name: '', start: '', end: '' }]; }
  function removeSchool(id) { schools = schools.filter((s) => s.id !== id); }
  function addJob() { workHistory = [...workHistory, { id: crypto.randomUUID(), company: '', type: '', start: '', end: '' }]; }
  function removeJob(id) { workHistory = workHistory.filter((j) => j.id !== id); }

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

  let experienceYears = $derived(workHistory.reduce((sum, j) => sum + monthsBetween(j.start, j.end), 0) / 12);
  let experienceDisplay = $derived(formatYearsFraction(experienceYears));
  let experienceOverride = $state('');

  const JOB_TYPES = ['Full-time', 'Part-time', 'Self-employed', 'Other'];
  const RACE_OPTIONS = ['White', 'Black', 'Hispanic', 'Asian', 'Other'];
  let workAuth = $state('');
  let startDate = $state('');
  let relocation = $state(''); // 'very_likely' | 'no' | 'own_country'
  let eeocGender = $state('');
  let eeocRace = $state('');
  let eeocRaceOther = $state('');
  let eeocVeteran = $state('');
  let eeocDisability = $state('');

  let skills = $state([]);
  // Reuses addingKey / addValue from the Questions pills. Enter keeps the input open for rapid entry.
  function commitSkill(keepOpen = false) {
    const value = addValue.trim();
    if (value && !skills.includes(value)) skills = [...skills, value];
    addValue = '';
    if (!keepOpen) addingKey = null;
  }
  function removeSkill(index) { skills = skills.filter((_, i) => i !== index); }

  // ---- Edit personal info: Questions tab ----
  const CARD_COLORS = ['var(--new)', 'var(--shortlist)', 'var(--applied)'];
  const BONUS_COLOR = '#c98a4b';
  const KIND_LABELS = { open: 'Write', star: 'STAR template', pills: 'Pick', one: 'Pick one', dual: 'Pick', bonus: 'Optional' };
  const STAR_FIELDS = [
    { key: 'situation', label: 'Situation', placeholder: 'What was going on?' },
    { key: 'action', label: 'What I did', placeholder: 'Your specific actions' },
    { key: 'result', label: 'Result', placeholder: 'The outcome, with numbers if you have them' }
  ];

  // kind: 'open' (textarea) | 'star' (Situation/Action/Result) | 'pills' (multi-pick)
  //       | 'one' (single pick, optional note) | 'dual' (two pill groups) | 'bonus'
  const QUESTIONS = [
    { id: 'describe', kind: 'open', title: 'Describe yourself in one paragraph',
      placeholder: "I'm a [role] with [X years] in [field]. I'm known for [strength], and I'm looking for [what's next].",
      template: "I'm a [role] with [X years] of experience in [field]. I'm known for [strength], and I'm looking for [what's next]." },
    { id: 'passions', kind: 'dual', title: 'Passions & work preferences',
      passions: ['Developer tools', 'Accessibility', 'Open source', 'Education', 'Healthcare', 'Climate'],
      prefs: ['Remote', 'Hybrid', 'Small team', 'Async-first', 'Fast-paced', 'Mentorship'] },
    { id: 'strengths', kind: 'pills', title: 'What are your greatest strengths?',
      options: ['Problem solving', 'Communication', 'Ownership', 'Adaptability', 'Attention to detail', 'Mentoring'] },
    { id: 'challenge', kind: 'star', title: 'Describe a challenge you overcame that showed your work ethic' },
    { id: 'coworkers', kind: 'pills', title: 'How would coworkers describe you?',
      options: ['Reliable', 'Curious', 'Calm under pressure', 'Direct', 'Collaborative', 'Creative'] },
    { id: 'achievement', kind: 'star', title: 'What is your proudest professional achievement?' },
    { id: 'motivation', kind: 'pills', title: 'What motivates you most?',
      options: ['Impact', 'Learning', 'Craft', 'Autonomy', 'Recognition', 'Team wins'] },
    { id: 'initiative', kind: 'star', title: 'Describe a time you led or took initiative' },
    { id: 'management', kind: 'one', title: 'What management style helps you do your best work?',
      options: ['Hands-off', 'Regular check-ins', 'Mentor-style', 'Direct feedback'] },
    { id: 'mistake', kind: 'star', title: 'Describe a mistake and what you learned from it' },
    { id: 'leaving', kind: 'one', title: 'Why did you leave (or are you leaving) your last role?',
      options: ['Growth', 'Compensation', 'Layoff', 'Relocation', 'Career change', 'Other'], note: true },
    { id: 'conflict', kind: 'open', title: 'How do you handle conflict on a team?',
      template: 'When a disagreement comes up, I start by [first step]. For example, when [situation], I [action], and the result was [outcome].' },
    { id: 'priorities', kind: 'open', title: 'How do you prioritize when everything is urgent?',
      template: 'I start by [how you sort the list]. Then I [how you communicate or decide]. The last time this happened, I [example].' },
    { id: 'fiveyears', kind: 'open', title: 'Where do you see yourself in five years?',
      template: "In five years I'd like to be [role or scope], having built expertise in [skills]. I'm drawn to this path because [reason]." },
    { id: 'hire', kind: 'open', title: 'Why should we hire you?',
      template: 'I bring [top strength] plus [second strength]. In my last role I [proof point], and I can do the same here by [what you would do].' },
    { id: 'bonus', kind: 'bonus', title: 'Bonus question',
      subtitle: "Anything not covered above you'd like the autofiller to know.",
      placeholder: 'Keep it short, e.g. career gaps, a move, constraints.' }
  ];

  function emptyAnswer(q) {
    if (q.kind === 'star') return { situation: '', action: '', result: '' };
    if (q.kind === 'pills') return [];
    if (q.kind === 'one') return { value: '', note: '' };
    if (q.kind === 'dual') return { passions: [], prefs: [] };
    return ''; // open, bonus
  }

  let personalSection = $state('basic'); // 'basic' | 'questions'
  let answers = $state(Object.fromEntries(QUESTIONS.map((q) => [q.id, emptyAnswer(q)])));

  function isAnswered(q) {
    const a = answers[q.id];
    if (q.kind === 'open' || q.kind === 'bonus') return a.trim() !== '';
    if (q.kind === 'star') return Object.values(a).some((v) => v.trim() !== '');
    if (q.kind === 'pills') return a.length > 0;
    if (q.kind === 'one') return a.value !== '';
    return a.passions.length > 0 || a.prefs.length > 0; // dual
  }
  let answeredCount = $derived(QUESTIONS.filter(isAnswered).length);

  // ---- Edit personal info: Basic tab status ----
  const BASIC_TOTAL = 7;
  let basicStatus = $derived.by(() => {
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const nSchools = schools.filter((s) => s.name.trim()).length;
    const nJobs = workHistory.filter((j) => j.company.trim()).length;
    const anyContact = Object.values(contacts).some((v) => v.trim()) || customContacts.length > 0;
    const extrasDone = Boolean(
      workAuth.trim() || startDate.trim() || relocation ||
      eeocGender.trim() || eeocRace || eeocVeteran.trim() || eeocDisability.trim()
    );
    return {
      identity:   { done: !!(personalName.trim() && personalDob), text: personalName.trim() && personalDob ? 'Done' : 'To do' },
      contacts:   { done: anyContact, text: anyContact ? 'Done' : 'To do' },
      education:  { done: nSchools > 0, text: nSchools ? plural(nSchools, 'school') : 'To do' },
      work:       { done: nJobs > 0, text: nJobs ? plural(nJobs, 'job') : 'To do' },
      experience: { done: experienceYears > 0 || experienceOverride.trim() !== '', text: 'Calculated from Work Experience' },
      skills:     { done: skills.length > 0, text: skills.length ? `${skills.length} added` : 'To do' },
      extras:     { done: extrasDone, text: extrasDone ? 'Done' : 'Optional' }
    };
  });
  let sectionsDone = $derived(Object.values(basicStatus).filter((s) => s.done).length);

  // ---- Edit preferences ----
  const PREF_FIELDS = {
    theme:  { color: 'var(--new)', options: [
      { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }] },
    size:   { color: 'var(--shortlist)', options: [
      { value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }] },
    comp:   { color: 'var(--bonus)', options: [
      { value: 'salary', label: 'Salary' }, { value: 'hourly', label: 'Hourly' }, { value: 'auto', label: 'Auto' }] },
    resume: { color: 'var(--applied)', options: [
      { value: 'tags', label: 'my tags, or mark Unresolved' },
      { value: 'ai', label: 'let AI decide when unsure' }] },
    open:   { color: 'var(--new)', options: [
      { value: 'exact', label: 'use my exact responses when possible, otherwise mark Unresolved' },
      { value: 'ai', label: 'let AI generate all responses for variety' }] },
    speed:  { color: 'var(--shortlist)', options: [
      { value: 'instant', label: 'instantly' },
      { value: 'human', label: 'at human speed (avoid anti-bot detection)' }] },
    cover:  { color: 'var(--bonus)', options: [
      { value: 'mine', label: 'always use mine, otherwise mark Unresolved' },
      { value: 'ai', label: 'generate one based on what you know about me' }] }
  };

  const AUTOMATION_OPTIONS = [
    { value: 'always_submit', title: 'Always submit when possible', desc: 'Fills and submits without asking.' },
    { value: 'mark_uncertain', title: 'Mark Uncertain when data is missing', desc: 'Fills what it can and flags the gaps for you.' },
    { value: 'simple_only', title: 'Only fill simple fields', desc: 'Names, contacts and dates. You do the rest.' }
  ];

  // TODO: persist these (e.g. chrome.storage.local) and load them on mount.
  // "Save changes" currently just closes the modal, like the other saveable modals.
  let prefs = $state({
    theme: 'system', size: 'default', comp: 'auto',
    automation: 'mark_uncertain',
    resume: 'tags', open: 'exact',
    speed: 'human', cover: 'mine'
  });

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

  let searchQuery = $state('');

  const SORT_OPTIONS = [
    { key: 'best', label: 'Best match' },
    { key: 'ai', label: 'Let AI order them' },
    { key: 'pay', label: 'Highest pay' },
    { key: 'newest', label: 'Newest first' }
  ];
  let sortBy = $state('best');
  let sortOpen = $state(false);
  let sortNode = $state(null);

  const timeOf = (j) => (j.postedAt ? new Date(j.postedAt).getTime() || 0 : 0);
  const payOf = (j) => j.salaryMax ?? j.salaryMin ?? -1;
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
        if (filters.remoteOnly && j.remote !== true) return false;
        if (filters.salaryListed && j.salaryMin == null && j.salaryMax == null) return false;
        if (filters.postedThisWeek && timeOf(j) < weekAgo) return false;
        if (q && !`${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(SORTERS[sortBy]);
  });

  // "You apply" (top N) → automation band → everything else.
  const OPEN_STATUSES = ['new', 'shortlisted'];
  const MANUAL_COUNT = 3;
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
  let removingIds = $state(new Set());
  const STALL__DELETIONS_MS = 400; // pause before the collapse starts

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
    removingIds = idSet;
      setTimeout(() => {
      jobs = jobs.filter((j) => !idSet.has(j.id));
      selectedIds = new Set([...selectedIds].filter((id) => !idSet.has(id)));
    }, STALL_DELETIONS_MS);
    setTimeout(() => (removingIds = new Set()), STALL_DELETIONS__MS + 500);
  }

  // Fixed topbar height is dynamic now (the filter bar can wrap), so the list offsets from it.
  let topbarH = $state(0);

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

  function formatSalary(job) {
    const min = job.salaryMin ?? job.salaryMax;
    const max = job.salaryMax ?? job.salaryMin;
    if (min == null) return null;
    return min === max ? Math.round(min).toLocaleString() : `${formatCompact(min)}–${formatCompact(max)}`;
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
  const RESUME_COLORS = ['var(--new)', 'var(--shortlist)', 'var(--applied)', 'var(--bonus)'];

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

  let resumeError = $state('');
  let dragOverId = $state(null);

  function addResume() {
    resumes = [...resumes, { id: crypto.randomUUID(), title: '', sim: [], fileName: '', fb: resumes.length === 0 }];
  }

  function setFallback(id) {
    resumes.forEach((r) => (r.fb = r.id === id));
  }
  function ensureFallback() {
    if (resumes.length && !resumes.some((r) => r.fb)) resumes[0].fb = true;
  }

  function removeResume(id) {
    resumes = resumes.filter((r) => r.id !== id);
    ensureFallback();
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
    // TODO: persist the file itself (e.g. read as ArrayBuffer into IndexedDB); only the name is kept for now.
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
      // TODO: no personal-info storage exists yet — wire this up once
      // Edit personal info actually persists something to wipe.
      throw new Error('Not implemented yet');
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
          <p class="job-meta">{job.company} · {job.location} · posted {job.postedAt}</p>
        </div>
        <div class="job-salary-col">
          <div class="job-salary">
            {#if salary}
              <span class="salary-flag" title={job.salaryIsPredicted ? 'Approximated' : 'Explicit'}>{job.salaryIsPredicted ? '~' : '✓'}</span>
              <span class="salary-dollar">$</span>
              <span class="salary-amount">{salary}</span>
            {:else}
              <span class="salary-flag" title="Approximated">~</span>
              <span class="salary-amount muted">not listed</span>
            {/if}
          </div>
          {#if salary}
            {@const lo = payPct(job.salaryMin ?? job.salaryMax)}
            {@const hi = payPct(job.salaryMax ?? job.salaryMin)}
            <div class="pay-bar" aria-hidden="true">
              <i class="pay-bar-fill" class:predicted={job.salaryIsPredicted} style="left: {lo}%; right: {100 - hi}%;"></i>
              {#if appliedFilterState.idealPayEnabled}
                <em class="pay-bar-ideal" style="left: {payPct(idealAnnual)}%;"></em>
              {/if}
            </div>
          {/if}
        </div>
        <div class="job-actions">
          <button class="job-act shortlist" class:on={job.status === 'shortlisted'} aria-pressed={job.status === 'shortlisted'} aria-label="Shortlist" title="Shortlist" onclick={act(() => toggleShortlist(job))}>{@html starIcon}</button>
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
  {/snippet}

  <svelte:window onclick={onWindowClick} onkeydown={(e) => { if (e.key === 'Escape') sortOpen = false; }} />

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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5" /></svg>
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
          <span class="spin-icon">{@html refreshIcon}</span>Applying… {run.done}/{run.total}
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
          {#if resumes.length > 0}
            <span class="sidebar-count sidebar-label">{resumes.length}</span>
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
          </button>
        </div>

        {#if activeModal === 'filters'}
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
                    <div class="field"><label for="pi-name">Full name</label><input id="pi-name" bind:value={personalName} /></div>
                    <div class="field"><label for="pi-dob">Date of birth</label><input id="pi-dob" type="date" bind:value={personalDob} /></div>
                  </div>
                </div>

                <!-- 2 Contacts -->
                <div class="bs" style="--c: var(--shortlist)">
                  {@render sectionHead(2, 'Contacts', basicStatus.contacts)}
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-email">Email</label>
                    <input id="pi-contact-email" class="contact-input" bind:value={contacts.email} placeholder="you@example.com" />
                    <span class="contact-spacer"></span>
                  </div>
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-phone">Phone</label>
                    <input id="pi-contact-phone" class="contact-input" bind:value={contacts.phone} placeholder="(555) 010-2938" />
                    <span class="contact-spacer"></span>
                  </div>
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-linkedin">LinkedIn</label>
                    <input id="pi-contact-linkedin" class="contact-input" bind:value={contacts.linkedin} placeholder="linkedin.com/in/you" />
                    <span class="contact-spacer"></span>
                  </div>
                  <div class="contact-row">
                    <label class="contact-label" for="pi-contact-github">GitHub</label>
                    <input id="pi-contact-github" class="contact-input" bind:value={contacts.github} placeholder="github.com/you" />
                    <span class="contact-spacer"></span>
                  </div>
                  {#each customContacts as c (c.id)}
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
                  {#each schools as school (school.id)}
                    <div class="entry-card">
                      {#if schools.length > 1}
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
                  {#each workHistory as job (job.id)}
                    <div class="entry-card">
                      {#if workHistory.length > 1}
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
                    <span class="exp-override">Override <input bind:value={experienceOverride} placeholder={experienceDisplay} /></span>
                  </div>
                </div>

                <!-- 6 Skills -->
                <div class="bs" style="--c: var(--shortlist)">
                  {@render sectionHead(6, 'Skills & certifications', basicStatus.skills)}
                  {#if skills.length > 0}
                    <div class="q-pills">
                      {#each skills as skill, i}
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
                    <div class="field"><label for="pi-workauth">Work authorization</label><input id="pi-workauth" bind:value={workAuth} placeholder="e.g. Authorized, no sponsorship needed" /></div>
                    <div class="field"><label for="pi-startdate">Earliest start date</label><input id="pi-startdate" bind:value={startDate} placeholder="e.g. 2 weeks notice" /></div>
                    <div class="field">
                      <span id="pi-relocation-label" class="field-label">Are you willing to relocate?</span>
                      <div class="pill-row" role="group" aria-labelledby="pi-relocation-label">
                        <button type="button" class="pill-toggle" class:active={relocation === 'very_likely'} onclick={() => (relocation = 'very_likely')}>Very likely</button>
                        <button type="button" class="pill-toggle" class:active={relocation === 'no'} onclick={() => (relocation = 'no')}>No</button>
                        <button type="button" class="pill-toggle" class:active={relocation === 'own_country'} onclick={() => (relocation = 'own_country')}>Only in my own country</button>
                      </div>
                    </div>
                  </div>

                  <div class="extras-divider"><span class="extras-label">Voluntary demographic info (EEOC)</span></div>
                  <div class="field-grid">
                    <div class="field"><label for="pi-gender">Gender</label><input id="pi-gender" bind:value={eeocGender} /></div>
                    <div class="field">
                      <label for="pi-race">Race / ethnicity</label>
                      <select id="pi-race" bind:value={eeocRace}>
                        <option value="">Select…</option>
                        {#each RACE_OPTIONS as r}<option value={r}>{r}</option>{/each}
                      </select>
                      {#if eeocRace === 'Other'}
                        <input bind:value={eeocRaceOther} placeholder="Please specify" aria-label="Race / ethnicity, other" />
                      {/if}
                    </div>
                    <div class="field"><label for="pi-veteran">Veteran status</label><input id="pi-veteran" bind:value={eeocVeteran} /></div>
                    <div class="field"><label for="pi-disability">Disability status</label><input id="pi-disability" bind:value={eeocDisability} /></div>
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
                      bind:value={answers[q.id]}
                      placeholder={q.placeholder ?? 'Write 2–4 sentences. Specifics beat generalities.'}
                    ></textarea>
                    {#if q.template && !answers[q.id].trim()}
                      <button type="button" class="q-template-btn" onclick={() => (answers[q.id] = q.template)}>✦ Insert starter template</button>
                    {/if}
                  {:else if q.kind === 'star'}
                    <div class="q-star3">
                      {#each STAR_FIELDS as f}
                        <label for="q-{q.id}-{f.key}">{f.label}</label>
                        <textarea id="q-{q.id}-{f.key}" class="q-textarea" bind:value={answers[q.id][f.key]} placeholder={f.placeholder}></textarea>
                      {/each}
                    </div>
                  {:else if q.kind === 'pills'}
                    {@render pillGroup(q.id, answers, q.id, q.options)}
                  {:else if q.kind === 'one'}
                    {@render pillGroup(q.id, answers[q.id], 'value', q.options, true)}
                    {#if q.note}
                      <input class="q-note" bind:value={answers[q.id].note} placeholder="Optional: one line of context" aria-label="Optional context" />
                    {/if}
                  {:else}
                    <div class="q-grp" style="color: var(--new)">Passions</div>
                    <div style="--c: var(--new)">{@render pillGroup(q.id, answers[q.id], 'passions', q.passions)}</div>
                    <div class="q-grp" style="color: var(--shortlist)">Work preferences</div>
                    <div style="--c: var(--shortlist)">{@render pillGroup(q.id, answers[q.id], 'prefs', q.prefs)}</div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else if activeModal === 'preferences'}
          <div class="pf">
            {@render prefHeader('App Customization', 'var(--new)', slidersIcon)}
            <p class="pf-sentence">Use the {@render prefPill('theme')} Theme with a {@render prefPill('size')} font.</p>
            <p class="pf-sentence">Show pay as {@render prefPill('comp')}.</p>

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

          {#if resumes.length > 0}
            <div class="rs-map">
              <div class="rs-map-title">Title coverage</div>
              {#each resumes as r, i (r.id)}
                <div class="rs-lane" style="--c: {RESUME_COLORS[i % RESUME_COLORS.length]}">
                  <span class="rs-dot"></span>
                  <b class="rs-lane-name">{r.title.trim() || 'Untitled'}{#if r.fb}<span class="rs-lane-star" title="Fallback resume" aria-label="Fallback resume">★</span>{/if}</b>
                  <span class="rs-lane-pills">
                    {#each resumeTitles(r) as t}
                      <span class="rs-mpill" class:dup={isDuplicate(r, t)}>{t}</span>
                    {/each}
                  </span>
                </div>
              {/each}
              <div class="rs-map-foot" class:bad={sharedTitleCount > 0}>
                {#if sharedTitleCount > 0}
                  <span class="rs-tri" aria-hidden="true">{@html warnTriIcon}</span>
                  {sharedTitleCount} shared title{sharedTitleCount === 1 ? '' : 's'} across resumes
                {:else}
                  ✓ Every title belongs to exactly one resume
                {/if}
              </div>
            </div>
          {/if}

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
                          <b>Duplicate title</b>“{r.title}” is also under {dupNames(r, r.title)}. Keep it under one resume so the autofiller can choose the best match.
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
          <!-- TODO: settings modal content -->

        {:else if activeModal === 'help'}
          <div class="help-hero">
            <span class="help-gh-badge">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            </span>
            <h2 class="help-heading">Have any questions?<br>Let me know.</h2>
            <p class="help-subtext">Job Sorter is open source. File a bug, request a feature, or just say hi.</p>
            <a class="help-gh-cta" href="https://github.com/alexirez/Job-Sorter-for-Chrome" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
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

  <div class="content-flow">
    {#if loadingState === 'loading'}
      <p class="note">Loading postings…</p>
    {:else if loadError}
      <p class="note">Couldn't load postings: {loadError}</p>
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
            <span class="handoff-icon" aria-hidden="true">{@html refreshIcon}</span>
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
        <div class="job-wrap" class:pending={removingIds.has(job.id)} :collapse={{ id: job.id }}>{@render jobCard(job, 'plain')}</div>
      {/each}

      {#if filteredJobs.length === 0}
        <p class="note">No postings match the current filters.</p>
      {/if}
      <p class="end-of-list">You've reached the end.</p>
    {/if}
  </div>
</div>
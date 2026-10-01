import {
  starIcon, sparkleIcon, planeIcon, rejectIcon, databaseIcon, sparklesIcon,
  mailIcon, boltIcon, bellIcon, shieldIcon
} from '../../ui/assets/icons';

// ---- Time / math ----
export const DAY_MS = 24 * 60 * 60 * 1000;
export const THREE_DAYS_MS = 3 * DAY_MS;
export const HOURS_PER_YEAR = 2080;

// ---- Main screen ----
export const STATUS_TILES = [
  { key: 'new', label: 'New', icon: sparkleIcon, color: 'var(--new)' },
  { key: 'shortlisted', label: 'Shortlisted', icon: starIcon, color: 'var(--shortlist)' },
  { key: 'applied', label: 'Applied', icon: planeIcon, color: 'var(--applied)' },
  { key: 'rejected', label: 'Rejected', icon: rejectIcon, color: 'var(--rejected)' }
];

export const QUICK_FILTERS = [
  { key: 'remoteOnly', label: 'Remote only', tone: 'teal' },
  { key: 'salaryListed', label: 'Salary listed', tone: 'amber' },
  { key: 'postedThisWeek', label: 'Posted this week', tone: 'blue' }
];

export const SORT_OPTIONS = [
  { key: 'best', label: 'Best match' },
  { key: 'ai', label: 'Let AI order them' },
  { key: 'pay', label: 'Highest pay' },
  { key: 'newest', label: 'Newest first' }
];

export const OPEN_STATUSES = ['new', 'shortlisted'];
export const MANUAL_COUNT = 3;

// ---- Modals ----
export const MODAL_TITLES = {
  filters: 'Filters',
  personal: 'Edit personal info',
  preferences: 'Edit preferences',
  resumes: 'Resumes',
  fetch: 'Fetch jobs',
  apply: 'Begin applying',
  settings: 'Settings',
  help: 'Help'
};
export const SAVEABLE_MODALS = ['personal', 'preferences', 'resumes'];
export const LARGE_MODALS = ['personal', 'preferences', 'resumes', 'settings'];
// These read saved data, so they wait until the load finishes.
export const NEEDS_LOAD_MODALS = ['personal', 'preferences', 'resumes', 'settings'];

// ---- Filters ----
export const COMP_TYPES = {
  salary: { min: 0, max: 500000, step: 1000, prefix: '$' },
  hourly: { min: 0, max: 240, step: 1, prefix: '$' }
};
export const WORK_TYPES = [
  { key: 'inPerson', label: 'In-person' },
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'unknown', label: 'Unknown' }
];
export const POSTED_WITHIN = [
  { key: '24h', label: '24h' },
  { key: '3d', label: '3d' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'any', label: 'Any' }
];

// ---- Personal info ----
export const JOB_TYPES = ['Full-time', 'Part-time', 'Self-employed', 'Other'];
export const RACE_OPTIONS = ['White', 'Black', 'Hispanic', 'Asian', 'Other'];
export const CARD_COLORS = ['var(--new)', 'var(--shortlist)', 'var(--applied)'];
export const BONUS_COLOR = '#c98a4b';
export const KIND_LABELS = { open: 'Write', star: 'STAR template', pills: 'Pick', one: 'Pick one', dual: 'Pick', bonus: 'Optional' };
export const STAR_FIELDS = [
  { key: 'situation', label: 'Situation', placeholder: 'What was going on?' },
  { key: 'action', label: 'What I did', placeholder: 'Your specific actions' },
  { key: 'result', label: 'Result', placeholder: 'The outcome, with numbers if you have them' }
];

// kind: 'open' (textarea) | 'star' (Situation/Action/Result) | 'pills' (multi-pick)
//       | 'one' (single pick, optional note) | 'dual' (two pill groups) | 'bonus'
export const QUESTIONS = [
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
export const BASIC_TOTAL = 7;

// ---- Preferences ----
export const PREF_FIELDS = {
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

export const AUTOMATION_OPTIONS = [
  { value: 'always_submit', title: 'Always submit when possible', desc: 'Fills and submits without asking.' },
  { value: 'mark_uncertain', title: 'Mark Uncertain when data is missing', desc: 'Fills what it can and flags the gaps for you.' },
  { value: 'simple_only', title: 'Only fill simple fields', desc: 'Names, contacts and dates. You do the rest.' }
];

// ---- Resumes ----
export const RESUME_COLORS = ['var(--new)', 'var(--shortlist)', 'var(--applied)', 'var(--bonus)'];

// ---- Settings ----
export const SETTINGS_SECTIONS = [
  { id: 'src',    title: 'Sources',    color: 'var(--new)',       icon: databaseIcon, desc: 'API tokens for job boards. Tokens stay on this device.' },
  { id: 'ai',     title: 'AI Model',   color: 'var(--applied)',   icon: sparklesIcon, desc: 'Pick a provider, connect it, and choose what AI is allowed to do.' },
  { id: 'email',  title: 'Email',      color: 'var(--shortlist)', icon: mailIcon,     desc: 'Let the extension follow your applications through your inbox.' },
  { id: 'auto',   title: 'Automation', color: 'var(--bonus)',     icon: boltIcon,     desc: 'How much the autofiller and fetcher do on their own.' },
  { id: 'alerts', title: 'Alerts',     color: 'var(--new)',       icon: bellIcon,     desc: 'Choose what is worth interrupting you for.' },
  { id: 'data',   title: 'Data',       color: 'var(--rejected)',  icon: shieldIcon,   desc: 'Storage, cleanup and your exports.' }
];
export const SEC = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.id, s]));

export const SOURCE_FIELDS = [
  { key: 'adzuna',  label: 'Adzuna',             desc: 'Job listings API',     placeholder: 'paste app key' },
  { key: 'jsearch', label: 'JSearch (RapidAPI)', desc: 'Aggregated listings',  placeholder: 'paste RapidAPI key' },
  { key: 'usajobs', label: 'USAJobs',            desc: 'US federal positions', placeholder: 'paste API key' }
];
export const AI_PROVIDERS = ['Anthropic', 'OpenAI', 'Google', 'Ollama (local)', 'Custom'];
export const AI_KEY_PLACEHOLDERS = ['sk-ant-...', 'sk-...', 'AIza...', '', 'paste token'];
// Suggestions only, since the field is free text. Verify names against each provider's docs.
export const AI_MODELS = [['claude-haiku-4-5-20251001', 'claude-sonnet-5-5'], ['gpt-4o-mini'], ['gemini-2.0-flash'], ['llama3.1'], []];
export const AI_TEST_LABELS = {
  idle: ['Not tested', ''],
  busy: ['Testing…', ''],
  ok:   ['Connected · model replied', 'ok'],
  fail: ["Couldn't connect. Check key and model.", 'bad']
};
export const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'proton.me', 'icloud.com', 'Other…'];
export const EMAIL_OTHER = EMAIL_DOMAINS.length - 1;
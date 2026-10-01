import { QUESTIONS } from './constants';

export const MIN_RESUMES = 3;

export const newResume = (fb = false) => ({ id: crypto.randomUUID(), title: '', sim: [], fileName: '', fb });
export const newSchool = () => ({ id: crypto.randomUUID(), name: '', start: '', end: '' });
export const newJob = () => ({ id: crypto.randomUUID(), company: '', type: '', start: '', end: '' });

export function emptyAnswer(q) {
  if (q.kind === 'star') return { situation: '', action: '', result: '' };
  if (q.kind === 'pills') return [];
  if (q.kind === 'one') return { value: '', note: '' };
  if (q.kind === 'dual') return { passions: [], prefs: [] };
  return '';
}

export const defaultAnswers = () => Object.fromEntries(QUESTIONS.map((q) => [q.id, emptyAnswer(q)]));

export const defaultResumes = () => Array.from({ length: MIN_RESUMES }, (_, i) => newResume(i === 0));

export const defaultPrefs = () => ({
  theme: 'system', size: 'default', comp: 'auto',
  automation: 'mark_uncertain',
  resume: 'tags', open: 'exact',
  speed: 'human', cover: 'mine'
});

export const defaultPersonal = () => ({
  name: '',
  dob: '',
  contacts: { email: '', phone: '', linkedin: '', github: '' },
  customContacts: [],
  schools: [newSchool()],
  workHistory: [newJob()],
  experienceOverride: '',
  skills: [],
  workAuth: '',
  startDate: '',
  relocation: '',
  eeoc: { gender: '', race: '', raceOther: '', veteran: '', disability: '' },
  answers: defaultAnswers()
});

export const defaultFilterState = () => ({
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
});

export const defaultSettings = () => ({
  merge: true,
  tokens: { adzuna: '', jsearch: '', usajobs: '', ai0: '', ai1: '', ai2: '', ai4: '' },
  customSources: [],
  aiProvider: 0, aiUrl: 'http://localhost:11434', aiModel: 'claude-haiku-4-5-20251001', aiTest: 'idle',
  aiOpen: true, aiFilter: true, aiPick: true,
  emailAccess: false, emailUser: '', emailDomain: 0, emailCustom: '',
  readOnStartup: true, scanDays: 1, autoStatus: true,
  noMatch: 0, dailyLimit: 25, autoFetch: 2, pauseCaptcha: true, skipApplied: true,
  notif: true, nReview: true, nMatch: true, nSkip: true, digest: 0,
  quiet: false, quietFrom: '22:00', quietTo: '07:00',
  deleteOld: true, deleteDays: 60, keepApplied: true, storeRaw: true
});
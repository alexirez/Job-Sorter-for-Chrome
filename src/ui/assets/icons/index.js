export { default as applyIcon } from './apply-icon.svg?raw';
export { default as archiveIcon } from './archive-icon.svg?raw';
export { default as chevronIcon } from './chevron-icon.svg?raw';
export { default as chevronsIcon } from './chevrons-icon.svg?raw';
export { default as deleteIcon } from './delete-icon.svg?raw';
export { default as fileTextIcon } from './file-text-icon.svg?raw';
export { default as filterIcon } from './filter-icon.svg?raw';
export { default as gearIcon } from './gear-icon.svg?raw';
export { default as listIcon } from './list-icon.svg?raw';
export { default as preferencesIcon } from './preferences-icon.svg?raw';
export { default as questionMarkIcon } from './question-mark.svg?raw';
export { default as refreshIcon } from './refresh-icon.svg?raw';
export { default as settingsIcon } from './settings-icon.svg?raw';
export { default as uploadIcon } from './upload-icon.svg?raw';
export { default as userIcon } from './user-icon.svg?raw';

export const slidersIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>`;
export const boltIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`;
export const eyeOffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 9.5 6a13 13 0 01-2.6 3.3M6.6 6.7A13.5 13.5 0 002.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>`;
export const starIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`;
export const warnTriIcon = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l7 12.5H1z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path class="excl" d="M8 6v3.5M8 11.5v.01" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const databaseIcon = svg('<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>');
export const sparklesIcon = svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>');
export const mailIcon = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>');
export const bellIcon = svg('<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0"/>');
export const shieldIcon = svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>');
export const shieldCheckIcon = svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>');

export const sparkleIcon = svg('<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>');
export const planeIcon = svg('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>');
export const rejectIcon = svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>');
export const closeIcon = svg('<path d="M6 6l12 12M18 6L6 18"/>');

// Modal close button: thinner stroke than closeIcon, matches the old inline SVG.
export const closeThinIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>`;

export const githubIcon = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
export const syncIcon = svg('<path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5"/>');

// Secret Menu's mark: the old key (🗝️). The glyph is Twemoji 1f5dd "old key"
// (https://github.com/jdecked/twemoji), © Twitter, Inc. and other contributors, CC-BY 4.0
// (https://creativecommons.org/licenses/by/4.0/). Changed: set on a parchment tile so it reads on dark
// backgrounds. See NOTICE.md. Plain TS (no JSX) so node tests and scripts/build-icons.mjs can import it.

const KEY_PATHS = `<path fill="#31373D" d="M7.915 34.868c.725.725 1.313 1.313 2.417.21 1.103-1.103-.665-2.871.439-3.975l.552-.552c1.104-1.104 2.872.664 3.974-.438 1.104-1.104.516-1.692-.21-2.417L12.41 25.02c-.725-.725-1.808-.819-2.417-.209l-4.964 4.964c-.61.609-.516 1.692.209 2.417l2.677 2.676z"/><path fill="#67757F" d="M1.03 33.772c.781.781 2.047.781 2.829 0l19.07-19.069c-.101-2.727 4.95-4.95 3.536-6.364-.781-.781-4.243 5.657-6.971 4.142L1.03 30.944c-.781.782-.781 2.048 0 2.828z"/><path fill="#31373D" d="M16.919 3.743c-2.148 2.147-2.149 5.63 0 7.778 2.148 2.148 5.63 2.148 7.778 0 2.147-2.148 2.147-5.63 0-7.778-2.148-2.148-5.631-2.148-7.778 0zm6.363 6.364c-1.366 1.367-3.583 1.367-4.95 0s-1.367-3.583 0-4.95 3.583-1.367 4.95 0 1.367 3.583 0 4.95z"/><path fill="#31373D" d="M26.111 1.622c-2.148 2.147-2.148 5.63 0 7.778 2.148 2.148 5.63 2.148 7.777 0 2.148-2.148 2.148-5.631 0-7.778-2.147-2.148-5.629-2.148-7.777 0zm6.364 6.364c-1.366 1.366-3.583 1.366-4.949 0-1.367-1.368-1.367-3.583 0-4.95 1.366-1.367 3.582-1.368 4.949 0 1.367 1.366 1.367 3.583 0 4.95z"/><path fill="#31373D" d="M23.989 10.814c-2.147 2.147-2.147 5.63 0 7.778 2.147 2.148 5.631 2.148 7.778 0 2.147-2.148 2.147-5.63 0-7.778-2.147-2.147-5.63-2.147-7.778 0zm6.365 6.364c-1.366 1.367-3.583 1.367-4.95 0s-1.366-3.583 0-4.949c1.367-1.367 3.583-1.368 4.95 0 1.366 1.366 1.366 3.582 0 4.949z"/><path fill="#67757F" d="M19.394 18.238c.781.781.781 2.048 0 2.829-.781.78-2.048.78-2.829 0l-2.829-2.829c-.781-.78-.781-2.047 0-2.828.781-.781 2.048-.781 2.829 0l2.829 2.828z"/><circle fill="#31373D" cx="26" cy="9" r="1"/>`;

// Key alone, 36x36 viewBox.
export const KEY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" aria-hidden="true" focusable="false">${KEY_PATHS}</svg>`;

// Key on a rounded parchment tile: the toolbar icon, favicon and in-page badge mark. The tile keeps the
// dark-grey key readable on dark toolbars and the dark badge; the edge keeps it distinct on white.
export const MARK_TILE = "#F4EAD5";
export const MARK_EDGE = "#C9B48A";
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><rect x="0.75" y="0.75" width="34.5" height="34.5" rx="8" fill="${MARK_TILE}" stroke="${MARK_EDGE}" stroke-width="1.5"/><g transform="translate(5.5 5.5) scale(0.6944)">${KEY_PATHS}</g></svg>`;

// Accessible name for the mark wherever it stands in for the product name. The emoji itself is never in a name.
export const MARK_LABEL = "Secret Menu";

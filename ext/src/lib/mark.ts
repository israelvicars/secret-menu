// Secret Menu's mark: the old key (🗝️). The glyph is Twemoji 1f5dd "old key"
// (https://github.com/jdecked/twemoji), © Twitter, Inc. and other contributors, CC-BY 4.0
// (https://creativecommons.org/licenses/by/4.0/). Changed: recolored light and set on a dark tile so it reads on
// light and dark backgrounds. See NOTICE.md. Plain TS (no JSX) so node tests and scripts/build-icons.mjs can import it.

const KEY_PATHS = `<path fill="#31373D" d="M7.915 34.868c.725.725 1.313 1.313 2.417.21 1.103-1.103-.665-2.871.439-3.975l.552-.552c1.104-1.104 2.872.664 3.974-.438 1.104-1.104.516-1.692-.21-2.417L12.41 25.02c-.725-.725-1.808-.819-2.417-.209l-4.964 4.964c-.61.609-.516 1.692.209 2.417l2.677 2.676z"/><path fill="#67757F" d="M1.03 33.772c.781.781 2.047.781 2.829 0l19.07-19.069c-.101-2.727 4.95-4.95 3.536-6.364-.781-.781-4.243 5.657-6.971 4.142L1.03 30.944c-.781.782-.781 2.048 0 2.828z"/><path fill="#31373D" d="M16.919 3.743c-2.148 2.147-2.149 5.63 0 7.778 2.148 2.148 5.63 2.148 7.778 0 2.147-2.148 2.147-5.63 0-7.778-2.148-2.148-5.631-2.148-7.778 0zm6.363 6.364c-1.366 1.367-3.583 1.367-4.95 0s-1.367-3.583 0-4.95 3.583-1.367 4.95 0 1.367 3.583 0 4.95z"/><path fill="#31373D" d="M26.111 1.622c-2.148 2.147-2.148 5.63 0 7.778 2.148 2.148 5.63 2.148 7.777 0 2.148-2.148 2.148-5.631 0-7.778-2.147-2.148-5.629-2.148-7.777 0zm6.364 6.364c-1.366 1.366-3.583 1.366-4.949 0-1.367-1.368-1.367-3.583 0-4.95 1.366-1.367 3.582-1.368 4.949 0 1.367 1.366 1.367 3.583 0 4.95z"/><path fill="#31373D" d="M23.989 10.814c-2.147 2.147-2.147 5.63 0 7.778 2.147 2.148 5.631 2.148 7.778 0 2.147-2.148 2.147-5.63 0-7.778-2.147-2.147-5.63-2.147-7.778 0zm6.365 6.364c-1.366 1.367-3.583 1.367-4.95 0s-1.366-3.583 0-4.949c1.367-1.367 3.583-1.368 4.95 0 1.366 1.366 1.366 3.582 0 4.949z"/><path fill="#67757F" d="M19.394 18.238c.781.781.781 2.048 0 2.829-.781.78-2.048.78-2.829 0l-2.829-2.829c-.781-.78-.781-2.047 0-2.828.781-.781 2.048-.781 2.829 0l2.829 2.828z"/><circle fill="#31373D" cx="26" cy="9" r="1"/>`;

// Key alone, 36x36 viewBox.
export const KEY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" aria-hidden="true" focusable="false">${KEY_PATHS}</svg>`;

// Key recolored light on one dark tile (UX spec v1 #22, option B): the toolbar icon, favicon, in-page badge and
// popup/page headers, in both themes. One fixed image, no per-theme swap. The subtle 1px inner edge keeps the tile
// distinct on dark toolbars and the dark badge.
export const MARK_TILE = "#1F1F1F";
export const MARK_EDGE = "#464646";
export const MARK_KEY_DARK = "#E8EAED"; // was #31373D (outline parts)
export const MARK_KEY_MID = "#96A0A8"; // was #67757F (shaft)
const LIGHT_KEY_PATHS = KEY_PATHS.replaceAll("#31373D", MARK_KEY_DARK).replaceAll("#67757F", MARK_KEY_MID);
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><rect x="0.5" y="0.5" width="35" height="35" rx="7.5" fill="${MARK_TILE}" stroke="${MARK_EDGE}" stroke-width="1" vector-effect="non-scaling-stroke"/><g transform="translate(6 6) scale(0.6667)">${LIGHT_KEY_PATHS}</g></svg>`;

// Accessible name for the mark wherever it stands in for the product name. The emoji itself is never in a name.
export const MARK_LABEL = "Secret Menu";

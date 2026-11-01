# Testing Secret Menu (hooks for agent-desktop and CDP)

Stable names and selectors that UI tests can rely on. Change them only together with this file.

## Unit tests

`npm test` (Node 22, no build needed) covers explain/labels, discover, hand-off prompts, the badge
message handler and copy, the popup message API, and the fixture contract below.
`cd ext && npx tsc --noEmit && npx wxt build` type-checks and builds into `ext/.output/chrome-mv3`.

Name checks (no Chrome): `test/cli-names.test.mjs` covers `secret-menu --help`, package names and the host name. The extension ID is unchanged.

## Toolbar and windows

| Hook | Value |
| --- | --- |
| Extension name / toolbar action title | `Secret Menu` (unique; find the toolbar button by this name) |
| Popup document title | `Secret Menu` |
| Hand-off page title | `Secret Menu: Hand-off` (`/handoff.html?tab=<id>` or `?site=<host>`) |
| Discover page title | `Secret Menu: Discover` (`/discover.html`) |
| Popup as a page | `/popup.html?tab=<id>&view=page&from=badge` (the badge's fallback when `chrome.action.openPopup` fails); window/document title `Secret Menu: Abilities` |
| Extension id | `jfeobmnppdjonobichecmfkabddogeim` (pinned by the manifest key) |

## Popup

- Root `main#sm-main[data-state]`: `loading`, `ready`, `empty-not-web`, `empty-no-webmcp`, `empty-no-tools`, `error`.
  Accessible name `Secret Menu popup` (as a tab: `Secret Menu abilities page`); its description (`aria-describedby=sm-main-state`,
  an sr-only span) reads `State: <state>`, so the AX tree shows the state without DOM access.
- Loading: `role=status`, aria-label `Loading: reading this page's WebMCP tools`.
- Empty states have aria-labels starting `Empty state:`; the error state has aria-label `Error: couldn't read this page`.
- Each ability is `li[data-testid=ability-row][data-label=<label>]` with aria-label `Ability: <title>, <label>`.
- Its expand button has `aria-expanded` and `aria-controls`, plus aria-label `Show details for <title>` (or `Hide details for <title>` when it's open).
- Expanded content: region `#sm-details-<n>` (`n` = 0-based row index, stable for a given page), `role=region`,
  `[data-testid=ability-details]`, accessible name `Details for <title>`; the row button's `aria-controls` points at it.
  Inside: tool codes, notes, `[data-testid=agent-prompt]` and a `Copy agent prompt` button.
- `Re-check this page's tools` button; nav `Secret Menu pages` with `Hand off to an agent` and `Discover sites`.
- Site icon: `[data-testid=site-favicon]` (tab favIconUrl) or `[data-testid=site-letter]`.

## Theme toggle (popup, hand-off, discover)

Three toggle buttons `Light`, `Dark`, `System`, each exposing `aria-pressed` (the AX tree shows pressed=true on the active one).
Stored in `chrome.storage.local["secretMenu.theme"]`. The effective theme is `html.dark` (popup/pages) and
`data-theme` on the badge.

Effective theme in the AX tree: `#sm-theme-status` (sr-only, `role=status`) is named
`Effective theme: light|dark`, with ` (following System)` appended when System is chosen; the toggle group's
`aria-describedby` points at it. DOM: `data-theme-effective` and `data-theme-pref` on the same element.

## Hand-off and Discover

- Hand-off: the switches `Let it change data (asks first)` and `Let it spend money (asks first)` are role `switch` (both off by default); plan lists are `[data-testid=plan-run|plan-ask|plan-never]`; prompt is `[data-testid=handoff-prompt]`. `Run in agent` is disabled on purpose (not built).
- Discover: search box `Search sites`; categories are a radiogroup (`aria-checked`); `[data-testid=recommended]`;
  rows `[data-testid=site-row]` with `Open`, `Hand off`, `Copy agent prompt`; footer `[data-testid=discover-footer]`.
  Empty states: `[data-testid=empty-index|empty-search|empty-category]`; error text `Error: local index unavailable`.

## In-page badge

- Mounted only after the page reports at least one WebMCP tool: pages without tools contain no Secret Menu element at all.
- Host element `secret-menu-badge` with a shadow root; inside it, region `Secret Menu`, button `.sm-open`
  (aria-label `Secret Menu: see what this page's WebMCP tools let you do`) and `.sm-close` (`Dismiss Secret Menu badge`).
- Clicking `.sm-open` first focuses the tab's window (`chrome.windows.update(..., {focused: true})`), then calls
  `chrome.action.openPopup`; if that fails (Chrome refuses when the window still isn't focused), it opens
  `/popup.html?tab=<id>&view=page&from=badge` next to the tab (window title `Secret Menu: Abilities`).
- Which one opened: the badge root gets `data-opened="popup|tab|none"` and `data-focused="true|false"`, and its
  `.sm-status` element (`role=status`, sr-only, inside the `Secret Menu` region) reads `Opened the Secret Menu popup`,
  `Opened Secret Menu abilities in a new tab` or `Couldn't open Secret Menu`. The service worker also stores
  `{ opened, focused, tabId, at }` in `chrome.storage.session["secretMenu.lastBadgeOpen"]` (readable from any extension page).
- The toolbar badge text shows the tool count (`99+` above 99).

## Launch tabs

`secret-menu launch <url...>` records the tab Chrome opens for each URL in `~/.secret-menu/run/opened-tabs.json`
(`by: "launch"`, origin only), so `secret-menu stop` and `close --mine` treat them as Secret Menu's. Matching is exact URL,
then same origin (redirects); tabs that were open before the launch are never claimed. A fresh launch clears ids left from
an earlier session first (tab ids restart).

## Deterministic fixture

- `./bin/secret-menu serve` hosts `test/fixtures/` on `http://127.0.0.1:8765/`.
- `explain.html` registers the 14 pinned tools from `test/fixtures/explain-tools.js`.
- `test/fixtures/explain-expected.json` lists the expected rows (title, label, from, tools) and counts; `test/fixture-expected.test.mjs` keeps them in sync with the code.
- UI tests should compare the popup's `ability-row` list against that JSON.

## Screenshot harness

`scripts/ui-shoot-v2.mjs` drives a test Chrome over CDP (port 9333, the one Secret Menu launched; never your everyday Chrome):

```
node scripts/ui-shoot-v2.mjs popup <tabId> <name> <outDir> light dark [--expand N] [--ax]
node scripts/ui-shoot-v2.mjs ext "/handoff.html?tab=<id>" <name> <outDir> 1000x760 light dark [--ax]
node scripts/ui-shoot-v2.mjs page <urlPrefix> <name> <outDir> light dark [--click]
```

Each run writes PNGs plus JSON (state, AX snapshot, badge probe). Output goes to the `<outDir>` you pass.

## The 🗝️ mark

The mark (`ext/src/lib/mark.ts`) is decorative everywhere: `aria-hidden="true"`, and the emoji never appears in an
accessible name or a document title. Names stay as before: badge region "Secret Menu", badge button
"Secret Menu: see what this page's WebMCP tools let you do", popup/page titles "Secret Menu…". In the DOM the React
surfaces carry `data-testid="sm-mark"`; in the badge's shadow root it is `.sm-icon svg`.

# Testing Secret Menu (hooks for agent-desktop and CDP)

Stable names and selectors that UI tests can rely on. They are a supported contract, not internals:

- popup root `#sm-main` (with `data-state`) and its state text `#sm-main-state`
- effective theme `#sm-theme-status`
- expanded rows `#sm-details-<n>`
- the in-page badge's `data-opened` and `data-focused`
- `data-testid="sm-mark"` on the 🗝️ mark
- launch-tab tracking in `~/.secret-menu/run/opened-tabs.json`

Renaming or removing one is a breaking change: update this file and its tests in the same commit.

## Optional: desktop UI test tools

Desktop UI tests drive the real Chrome window through the macOS accessibility tree with
[agent-desktop](https://www.npmjs.com/package/agent-desktop). It's a development tool only; Secret Menu never needs it at runtime.

```sh
npm i -g agent-desktop
```

In System Settings > Privacy & Security, give **Accessibility** and **Screen Recording** to the app that launches it
(your terminal, or the agent app that runs it).

## Unit tests

`npm test` (Node 22, no build needed) covers explain/labels, discover, hand-off prompts, the badge
message handler and copy, the popup message API, and the fixture contract below.
`cd ext && npx tsc --noEmit && npx wxt build` type-checks and builds into `ext/.output/chrome-mv3`.

Name checks (no Chrome): `test/cli-names.test.mjs` covers `secret-menu --help`, package names and the host name. CLI `tools`/`form` headers use the popup's five plain labels and a secondary raw-hint line; JSON remains the raw tool list. The extension ID is unchanged.

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

- Root `main#sm-main[data-state]`: `loading`, `ready`, `empty-not-web`, `empty-insecure`, `empty-no-webmcp`, `empty-no-tools`, `error`.
  Accessible name `Secret Menu popup` (as a tab: `Secret Menu abilities page`); its description (`aria-describedby=sm-main-state`,
  an sr-only span) reads `State: <state>`, so the AX tree shows the state without DOM access.
- Loading: `role=status`, aria-label `Loading: reading this page's WebMCP tools`, `data-state=loading`. It is a skeleton with the ready layout (header, count row, 6 rows, read line), invisible for the first 150 ms and then shown; there is no fixed min-height.
- Empty states have aria-labels starting `Empty state:`; the error state has aria-label `Error: couldn't read this page`. Error details are in a collapsed native `<details>` under `summary` `Details`, with the raw message in `[data-testid=error-detail]`.
- The insecure empty state has aria-label `Empty state: page isn't secure` and no buttons. The three reasoned empty states use `[data-testid=flag-hint][data-reason]`; the WebMCP flag state has aria-label `Empty state: WebMCP is probably off`, `data-reason=no-webmcp`, an `open-webmcp-flag` button, and `webmcp-flag-note`. If opening the flag page fails, it shows `copy-webmcp-flag`, `copy-webmcp-flag-note`, and the flag address. The no-tools state has aria-label `Empty state: no WebMCP tools on this page`, `data-reason=no-tools`, and `discover-with-tools`. To force the copy-address fallback in CDP tests, override `chrome.tabs.create` in the popup page to reject before clicking `open-webmcp-flag`.
- Ready reports include a single-line, non-wrapping `aria-label="Tool counts by label"` row of non-zero count pills below the site summary.
- Each ability is `li[data-testid=ability-row][data-label=<label>]` with aria-label `Ability: <title>, <label>`.
- Its expand button has `aria-expanded` and `aria-controls`, plus aria-label `Show details for <title>` (or `Hide details for <title>` when it's open).
- Expanded content: region `#sm-details-<n>` (`n` = 0-based row index, stable for a given page), `role=region`,
  `[data-testid=ability-details]`, accessible name `Details for <title>`; the row button's `aria-controls` points at it.
  Inside: tool codes, notes, `[data-testid=agent-prompt]` and a `Copy agent prompt` button.
- Ability titles wrap (`[data-testid=ability-title]`, never truncated); the full title is also in `title`. The chevron (`[data-testid=row-chevron]`) and label pill are top-aligned to the first title line, not centered on the row.
- Under the rows, `[data-testid=read-note]` always says `No page tools were called.` or `Probed N read-only tool(s).`; the label legend `[data-testid=label-legend]` (hint / guessed / mixed) is only rendered while at least one row is expanded.
- Scroll cue: `main` has `data-more-below=true|false`; while true, `[data-testid=scroll-cue]` (a fade over the bottom edge of the scroll area, outside the scrolling content) is rendered and the nav gets a top shadow.
- `Re-check this page's tools` button; nav `Secret Menu pages` with `Hand off to an agent` and `Discover sites`.
- Site icon: `[data-testid=site-favicon]` (tab favIconUrl) or `[data-testid=site-mark]` (no favicon); the former `site-letter` tile was removed.

## Theme toggle (popup, hand-off, discover)

One button `[data-testid=theme-toggle]` (no menu) cycles Light → Dark → System. Its accessible name and tooltip are `Theme: <Current>. Switch to <Next>` (e.g. `Theme: Dark. Switch to System`), its icon is a sun, moon or monitor, and it carries `data-theme-pref`. To reach a given theme, click until the name starts with `Theme: <Wanted>.` (at most two clicks).
Stored in `chrome.storage.local["secretMenu.theme"]`. The effective theme is `html.dark` (popup/pages) and
`data-theme` on the badge.

Effective theme in the AX tree: `#sm-theme-status` (sr-only, `role=status`) is named
`Effective theme: light|dark`, with ` (following System)` appended when System is chosen; the button's
`aria-describedby` points at it. DOM: `data-theme-effective` and `data-theme-pref` on the same element.

## Hand-off and Discover

- Hand-off: the switches `Let it change data (asks first)` and `Let it spend money (asks first)` are role `switch` (both off by default); plan lists are `[data-testid=plan-run|plan-ask|plan-never]`; prompt is `[data-testid=handoff-prompt]`. plan lists group tools by ability (disclosure per ability, tool names inside); `Run in agent` is hidden (not built; `SHOW_RUN_IN_AGENT` in Handoff.tsx).
- Discover: search box `Search sites` with a `Clear search` button while a query is active; categories are a radiogroup (`aria-checked`); `[data-testid=recommended]` is only rendered when it adds sites beyond the displayed categories and is hidden while a query is active;
  rows `[data-testid=site-row]` with `Open`, `Hand off`, `Copy agent prompt`; footer `[data-testid=discover-footer]`.
  Empty states: `[data-testid=empty-index|empty-search|empty-category]`; error text `Error: local index unavailable`.
- No native host (before `npx secret-menu setup`): not an error. Discover renders `[data-state=connect]` with
  `[data-testid=connect-agent]` (`role=status`, named `Connect your agent`, `Copy setup command` and `Copy MCP command` buttons) instead of the
  error; `Error: local index unavailable` is only for a helper that is installed but fails. Hand-off `?site=` renders the same
  connect state; hand-off `?tab=` still works and adds a compact `[data-testid=connect-agent][data-compact=true]` notice above the form with a `Show steps` toggle (`aria-expanded`), plus `[data-testid=works-after-setup]` next to `Copy agent prompt`. The popup is unchanged.
  The service worker logs nothing while the host is missing (it retries quietly, up to every 30s).

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

`scripts/ui-shoot-v2.mjs` drives a test Chrome over loopback CDP on port 9333, never your everyday Chrome. `secret-menu launch`
doesn't open a debugging port: start the test Chrome with `--remote-debugging-port=9333` yourself (for example by pointing
`SECRET_MENU_CHROME` at a small wrapper script that adds it), and only while testing, because anything on the machine can
drive a Chrome through that port without Secret Menu's checks.

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

## Stopping the test Chrome

`secret-menu stop` sends SIGTERM and waits up to `--timeout SECONDS` (default 8). It never sends SIGKILL unless you pass
`--kill`; without it, a Chrome that is still running after the timeout is reported and stop exits with code 4, so harnesses
can use it safely and decide themselves. `--force` only skips the foreign-tab check. Unit tests: `test/stop.test.mjs`.

# Handoff: UX fixes (branch `ux-fixes`, off `rebrand` @0ee0af5)

Scope: UX Bot spec v1 (approved by the owner on Nov 3, 2026), plus the Nov 4 store-name amendment. Local branch only: nothing has been pushed, and store text and the README hero are unchanged pending the owner's OK.

## Status by item
| # | Item | Status | Commit |
|---|---|---|---|
| v0 1–7, 9–11 | Short ability titles, neutral provenance, theme menu, dark mark | done | 2ed9519 |
| 2 | Scroll cue so the sticky footer never hides the last row | done (sticky fade, `hasMoreBelow` in `ext/src/lib/scroll-cue.ts`) | d2b2c47 |
| 2 | README hero re-crop | waiting for publish OK | — |
| 3 | One description everywhere (CLI tagline, README top, extension) | done. Manifest name is "Secret Menu for WebMCP" with the approved 127-char description. The action title and in-product brand stay "Secret Menu", and the key/ID are unchanged | 618b20e, 9deaf6b |
| 4 | Count pills read "N · label", on one line | done (`ext/src/lib/count-pills.ts`) | 618b20e, d2b2c47 |
| 6 | Favicon, or the key mark as the only fallback | done (the `site-letter` tile was removed) | d2b2c47 |
| 8 | Dropped | reverted the badge/mark changes back to 0ee0af5 | d2b2c47 |
| 9 | Policy wording | done, with the claim corrected (see Disagreements) | 618b20e |
| 12 | Publish overlay notes | notes only, nothing published | — |
| 13 | Plain error copy with a Details toggle | done (`ext/src/lib/error-copy.ts`) | d2b2c47 |
| 14 | Long names wrap, with the full name on hover | done | 618b20e, d2b2c47 |
| 15 | CLI `tools` uses popup labels; no more `[mutating?]` | done (`labelLine`/`hintLine` in `lib/core.mjs`) | 9deaf6b, a60ff91 |
| 16 | Humanized row titles | done (`lib/explain.mjs`) | 9deaf6b |
| 17 | Hand-off sign-in wording | done | 618b20e |
| 18 | No-WebMCP copy, with the raw cause moved to Details | done | d2b2c47 |
| 19 | Discover: hide Recommended while searching; Clear search | done | 618b20e |
| 20 | CLI help: Start here plus a one-line summary per command | done (`lib/cli-help.mjs`; `--help` never runs the command) | 9deaf6b |
| 21 | Loading skeleton at the final height | done (shows after 150 ms) | d2b2c47 |

## TESTING.md hook changes (updated together with their tests)
- The theme control is one `[data-testid=theme-toggle]` button cycling Light → Dark → System (re-review #24; it was a menu in between).
- Site icon: favicon or `site-mark` only, since `site-letter` is gone.
- "Run in agent" is hidden (`SHOW_RUN_IN_AGENT=false`).
- Discover: Recommended only shows when there is no query; Clear search was added.
- Error block: a native `<details>` "Details" element with `data-testid=error-detail`.
- Count row: `aria-label="Tool counts by label"`.
- Loading: `role=status`, `data-state=loading`.
- CLI `tools`/`form` output now uses `name  label (source)` plus a `hint:` line, and `--help` has a new layout.

## Known follow-up
- The external e2e harness `secret-menu-desktop-e2e` now drives the single theme toggle (local commit 66dce90, not run on the desktop yet).
- The page bridge does not pass `destructiveHint` through, so the CLI `hint:` line can't show it yet.

## Checks at HEAD
(Superseded by the npm-setup section below.) At 32fe334, `npm test` passed 126/126, `npm run ext:build` succeeds and `cd ext && npx tsc --noEmit` is clean. After-shots are in the UX Bot review folder (`after/`); Allbirds was skipped because only fixture pages were used.

## Re-review fixes (Nov 4)
| # | Item | Commit |
|---|---|---|
| 22 | One fixed key mark (light key on a #1f1f1f tile with a 1px inner edge) in both themes, including the error state | 43098c9, c232ba5 |
| — | "Sign-in / sign-out / sign-up" hyphenated in ability titles | 6603d92 |
| 1, 2, 21 | Popup re-review fixes | c232ba5 |
| 23 | The probe line sits under the rows and is always shown; the label legend shows only while a row is expanded | c232ba5 |
| 24 | Theme: one cycling button (Light → Dark → System), `Theme: <Current>. Switch to <Next>` | c232ba5 |
| 25 | Chevron and leading icon top-aligned with the first title line | c232ba5 |

## npm-setup (branch `npm-setup`, fast-forward of `ux-fixes`)
- `secret-menu setup [--extension-id ID]` installs `com.secretmenu.bridge` for the user's own Chrome (macOS and Linux; Windows reports unsupported).
  - ID order: `--extension-id`, then `SECRET_MENU_EXTENSION_ID`, then the pinned ID in `ext/EXTENSION_ID`.
  - It copies bin/lib/host into `$SECRET_MENU_HOME/native-host/setup/app` and writes a `/bin/sh` launcher that pins the current Node, plus a `setup.json` receipt.
  - It is idempotent and prints the "Connect your agent" MCP config. `lib/setup.mjs` has the code; `test/setup.test.mjs` uses a temp HOME.
- `secret-menu doctor` prints ok/FAIL lines with fixes and exits 1 on failure.
- `secret-menu uninstall` removes only setup's launcher dir and a manifest that still points at it. `host/install-native-host.mjs` (used by `launch`) is unchanged.
- Extension without the host:
  - The service worker stays quiet and retries quietly every 30s.
  - Discover and Hand-off `?site=` show `[data-testid=connect-agent]` instead of an error.
  - Hand-off `?tab=` adds the card above the plan.
  - The popup is unchanged. TESTING.md is updated.
- `package.json` is ready for npm as `secret-menu`: no `private`, plus `files`, `engines >=22`, MIT, repository, keywords. There is no `author` (it would trip the publish "person name" guard) and no `mcpName` (it would trip the "username" guard).
- `docs/npm-README.draft.md` is the npm README draft, to merge into the publish overlay README.
- Not done: npm login and publish, `build.sh`, and any push.

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
- `secret-menu setup [--extension-id ID ...]` installs `com.secretmenu.bridge` for the user's own Chrome (macOS and Linux; Windows reports unsupported).
  - Repeat `--extension-id` or use comma-separated values. IDs from the flag (or, when no flag is present, `SECRET_MENU_EXTENSION_ID`) come first, followed by the pinned ID and the store ID once assigned.
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

## Published state (Nov 4, 2026, 1:20 AM EST)
- Public GitHub `main` @ `c0c46f3` ("Add npx secret-menu setup, doctor, uninstall; npm package"), built from `npm-setup` @ `1c8c2cf` with the owner's OK. build.sh guards, gitleaks (tree and history) and verify.sh (137/137 tests, ext build, tsc) passed.
- The public README is the publish overlay, now with the npm install flow (setup, connect, doctor, uninstall). The Web Store link is noted as coming.
- The publish step adds the `mcpName` line (the MCP registry name) to package.json and drops `author`; the username guard allows exactly that one line.
- npm: `secret-menu@0.1.0` was later published by the owner with the one-time password (`npm view secret-menu version` gave 0.1.0 on Nov 4).

## store-prep (branch `store-prep`, off `npm-setup` @1c8c2cf)
- 9fbc878: trimmed permissions (`nativeMessaging`, `scripting`, `storage` plus http/https hosts). `npm run ext:zip:store` builds the store zip without `key` or source maps. Dev builds keep `key`.
- 5f26fd5: `docs/store/permissions.md` is the permission audit, with a store justification for each permission and the extension-ID decision.
- e6a4de7: UX round 3 (#26-#30).
  - The Connect card has labelled copy buttons ("Copy setup command" and "Copy MCP command") and a step 2 code box that names Claude Desktop and Cursor.
  - "bridge" is now "Secret Menu's helper on this computer", and singular/plural counts use `countLabel`.
  - Hand-off `?tab=` puts a compact card above the form, with a "Show steps" toggle and "Works after setup" next to Copy agent prompt.
  - TESTING.md hooks are updated.
- 23cf196: `setup`/`doctor` always allow the pinned ID plus `STORE_EXTENSION_ID` (`null` until the store assigns it; fill it in `lib/setup.mjs`), plus repeatable or comma-separated `--extension-id`. The hand-off sign-in line now says "in your Chrome".
- fd0f93f: `docs/store/install-trip-ups.md` (clean-install findings, including the WebMCP flag check on stable 157), `docs/PRIVACY.draft.md` (now `PRIVACY.md`).
- a0e11d7: copy buttons keep their width when they switch to "Copied" (#26 follow-up). The shared `ext/src/components/copy-label.tsx` stacks both labels in one inline-grid cell and marks the inactive one `invisible` + aria-hidden. It covers the Connect card, the Discover row, Hand-off and the Popup. aria-labels and test ids are unchanged. Width is measured as identical before, during and after the click.
- Release zip: `ext/.output/secret-menu-extension-0.1.0-chrome.zip` (rebuilt after a0e11d7), 145,997 bytes, 23 files, sha256 `9c87b95415e1d60cf834216944fb5af1f6ffcb27491d4cd85fb926a4ae5135b8`. Checked: no maps, no `sourceMappingURL`, no local paths, no `key`. Not uploaded.
- a685063: the Connect card's two copy buttons share one width. `CopyLabel` takes `sizeLabels`, and both rows size to the longer label ("Copy setup command"). Both measure 159.94px in the Discover card and in the Hand-off compact card, light and dark, before and after a click.
- 1fa9a69: trip-ups #3 to #6. `serve` ships `test/fixtures/` in the npm package, takes `--port`, and explains a busy port. CLI `explain` indexes the site. `Try:` lines use `secret-menu` / `npx secret-menu`.
- f8f7791: trip-up #7. `setup`/`doctor`/`uninstall --browser` supports chrome, chrome-beta, chrome-dev, chrome-canary (macOS) and chromium, with detection and a Chrome fallback.
- PRIVACY.md at the repo root (effective Nov 4, 2026; contact via GitHub issues). Root package.json is 0.1.1; the extension stays 0.1.0 for its first store upload.
- Open items:
  - Fill in `STORE_EXTENSION_ID` once the store assigns it.
  - Held for the owner: the popup flag hint, the Connect step spacing, and the "Its command is:" rewording.

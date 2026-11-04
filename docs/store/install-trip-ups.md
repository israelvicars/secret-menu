# Clean install: trip-ups

A stranger's install, run on 2026-11-04 on an Apple Silicon Mac with Node 22.19 and Chrome for Testing 156.0.8078.73. I followed only the public README (`origin/main` of the public repo), with a fresh, throwaway `--user-data-dir` and a temp `HOME`. One test Chrome at a time, stopped with SIGTERM. The everyday Chrome profile and the real `~/.secret-menu` were not used.

## What was run

**Tier 1: extension only (discovery).** A fresh `wxt build` of `store-prep`, loaded unpacked with `--load-extension` into a new profile, with no native host.
- The service worker started with ID `jfeobmnppdjonobichecmfkabddogeim` (pinned by `key`). Permissions were `nativeMessaging, scripting, storage`, and host access was http/https.
- On the `serve` test page:
  - the badge rendered;
  - `chrome.tabs.query` returned the http tab's url and title without the `tabs` permission;
  - `chrome.scripting.executeScript` worked.
- Popup (`popup.html?view&tab=`): "3 WebMCP tools", with the abilities listed.
- Discover showed the "Connect your agent" card (`[data-testid=connect-agent]`), not an error.

**Tier 2: CLI.**
- `npm pack` gave a 31-file, 54.1 kB tarball. I installed it into a temp prefix with `npm install -g --prefix`, using a temp HOME and a temp npm cache.
- `secret-menu setup --extension-id jfeobmnppdjonobichecmfkabddogeim` wrote the host into `$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts`. I then launched Chrome for Testing with `--user-data-dir` set to that same `.../Google/Chrome` folder, so it found the manifest there.
- Chrome started the host and the bridge socket came up. `doctor` passed all 8 checks.
- `open`, `tabs` and `explain` worked: 14 tools on `/explain.html`.
- MCP over stdio: `initialize`, `tools/list`, `list_tabs` and `explain_page` all worked.
- After `explain_page`, Discover listed the site ("14 tools").

## Trip-ups

1. **The README predates npm and the store.** It says "isn't in the Chrome Web Store or on npm yet. You run it from a clone", and it has no `setup` step. A stranger who reads it sees `launch` (the separate test Chrome) as the only way to use the extension. "Load unpacked into another Chrome" is labelled untested and "Discover … won't load there". Both are out of date: Discover now shows the Connect card, and `setup` connects it. *Fix:* publish the npm README draft (`docs/npm-README.draft.md`) and add a store/`setup` path to the main README at release.
   **Status (0.1.1): documented. The public README (publish overlay) now leads with `npx secret-menu setup`, marks the Chrome Web Store as coming soon, and drops the clone-only wording for `serve`.**
2. **The test-page caption doesn't match `serve`.** The README calls the test page "a fake shop with 14 tools", but `secret-menu serve` serves the 3-tool churn fixture at `/`. The 14-tool shop is at `/explain.html`. *Fix:* point the README at `/explain.html`, or make `/` the shop.
   **Status (0.1.1): documented. The README caption now points at `/explain.html` (the 14-tool shop); `/` stays the 3-tool page.**
3. **`serve` is broken from the npm package.** `test/fixtures` isn't in `package.json` `files`, so an npm-installed `secret-menu serve` answers 404 for every page. *Fix:* add `test/fixtures/` to `files` (about 30 kB), or move the fixtures under `lib/`. Otherwise, have `serve` exit with a clear message when the fixtures are missing.
   **Status (0.1.1): fixed (1fa9a69). `test/fixtures/` (about 11 kB, no personal data) is in `files`, and `serve` exits with a clear message if the fixtures are missing. Tested with `npm pack --dry-run`.**
4. **`serve` crashes with a raw stack trace when port 8765 is busy** (unhandled `EADDRINUSE`). *Fix:* catch it and print "port 8765 is in use".
   **Status (0.1.1): fixed (1fa9a69). `serve --port N`; a busy port prints "Port N is already in use. Stop the other server or run: secret-menu serve --port <n>" and exits 1, with no stack trace.**
5. **CLI `explain` doesn't add the site to the local index.** Only MCP `explain_page` and `open_site` call `cacheExplain`. But Discover's empty state says "Run `secret-menu explain` on a site … and it will show up here", and the README says "Each site you explain is saved to a local index". In the test, the index stayed empty after `secret-menu explain` and filled only after MCP `explain_page`. *Fix:* call `cacheExplain` in the CLI `explain`, or change the copy.
   **Status (0.1.1): fixed (1fa9a69). CLI `explain` now calls `cacheExplain`, like MCP `explain_page`, so the site shows up in Discover.**
6. **`explain`'s "Try:" line prints the absolute install path,** for example `…/lib/node_modules/secret-menu/bin/secret-menu call …`. Under `npx` it would be an npx cache path. *Fix:* print `secret-menu` (or `npx secret-menu`) when running from a package install.
   **Status (0.1.1): fixed (1fa9a69). From a package install the examples print `secret-menu …`, and from the npx cache `npx secret-menu …`. A source checkout still prints its own bin path.**
7. **`setup` only targets Google Chrome stable's default data folder.** Chrome Beta, Canary, Chromium, Chrome for Testing and any custom `--user-data-dir` read `<data dir>/NativeMessagingHosts`. A user with one of those gets a passing `doctor` (it checks the manifest file, not the browser) but no connection. *Fix:* a `--browser`/`--hosts-dir` option, or document it.
   **Status (0.1.1): fixed (f8f7791). `setup`/`doctor`/`uninstall --browser chrome|chrome-beta|chrome-dev|chrome-canary|chromium|all` (Canary is macOS only). Without `--browser`, setup detects the installed data folders, falls back to Chrome, and prints each browser and folder it wrote to. Chrome for Testing and custom `--user-data-dir` folders are still not covered.**
8. **The extension ID will differ for a store install** unless the first upload carries the matching `key.pem` (see `docs/store/permissions.md`). With a different ID, the copied `npx secret-menu setup` silently allows the wrong origin. *Status (commit 23cf196):* `setup` and `doctor` now always allow the pinned ID plus `STORE_EXTENSION_ID` in `lib/setup.mjs` (still `null`; fill it in once the store assigns the ID), and accept extra IDs with a repeatable or comma-separated `--extension-id`. *Remaining:* fill in `STORE_EXTENSION_ID` before the npm release that goes with the store listing, or upload with `key.pem` so the IDs match.
9. **No `chrome://flags` guidance for the user's own Chrome.** The README explains the WebMCP flag only through `launch`, which sets `--enable-features=WebMCP` for its own Chrome. A store user on stable Chrome sees tools only on origin-trial sites, or after enabling `chrome://flags/#enable-webmcp-testing`. *Checked on Nov 4, 2026* with Chrome for Testing 157.0.8103.38, the current stable version (the stable channel in https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json), clean profile, extension loaded:
   **Status (0.1.1): documented. The README states that stable Chrome needs `chrome://flags/#enable-webmcp-testing` except on origin-trial sites. The popup flag hint is held for the owner's decision.**
   - without the flag, `typeof document.modelContext` is `"undefined"` on the local test page, the page says "WebMCP unavailable", and the popup says "No WebMCP here";
   - with `--enable-features=WebMCP` (what `chrome://flags/#enable-webmcp-testing` sets), `document.modelContext` is an object and the popup shows "ready · 3 WebMCP tools".
   - Official docs agree: https://developer.chrome.com/docs/ai/webmcp says WebMCP is available behind `chrome://flags/#enable-webmcp-testing` for local development and through the origin trial from Chrome 149. Sites with a valid origin-trial token should work without the flag (not tested here; no trial site was used).
   - So stable Chrome needs the flag everywhere except origin-trial sites, and the popup's "No WebMCP here … Most sites don't yet" can mislead a user whose Chrome lacks the flag.
   *Fix:* one line in the listing and the README, and a flag hint in the popup when `document.modelContext` is missing.

## Not tried
- The native "Load unpacked" UI flow on `chrome://extensions`. I used the `--load-extension` switch instead, which gives the same unpacked install.
- A real site in a clean profile (Allbirds and similar). Only the local fixtures were used.
- Linux.

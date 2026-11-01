# Known issues

Found in live tests with Chrome for Testing 156 and the WebMCP flag on. "Fixed in code" means unit-tested but not yet re-checked in a live browser.

## Open

1. **Closing the last window kills the bridge.** The native host goes down, so `secret-menu open` can't reopen anything. Only `secret-menu launch` recovers.
2. **`watch` is silent when the host dies** and doesn't resubscribe after a host restart.
3. **Expired approvals are not audited.** Pending approvals that age out unused leave no audit record.
4. **The audit anchor sits next to the log.** `audit.jsonl.head` detects records cut from the end of `audit.jsonl`, but someone who can edit both files can still hide truncation. A stronger anchor would live outside the data folder.
5. **Late tools can still be missed.** `--wait-tools` waits for a 3.5 s quiet window (`--settle`), capped by `--timeout`. Pages that register tools later than that are missed. The popup waits at most 3 s (0.5 s quiet window).
6. **Per-site allowlist limits.** The policy is keyed by origin only (not path or tab). Allowlisted tools are trusted by name, so if a site changes what a tool does, the allowlist still lets it run. MCP clients can't edit the policy.
7. **Explain heuristics are rules, not understanding.** Every label says "from site hint" or "guessed", and every ability lists the exact tool names. Known misses:
   - Shopify marks `browse_store`, `get_product` and `show_variant` as not read-only, so Secret Menu guesses their labels from the names.
   - `get_ucp_profile` reads as "See your ucp profiles" (jargon).
   - Example arguments such as `catalog={}` are placeholders, not working inputs.
   - Sign-in needs are not always detected, and sites with no hints get guessed labels for every tool.
8. **Recipe relevance is keyword rules.** `compare-shopify` uses a small synonym list (sneaker, shoe, bag). Other categories fall back to plain word matching, and store search is the site's own and can be fuzzy (Glossier answers "bag" with pet-waste bags).
9. **Codex and non-read-only tools.** Codex auto-cancels MCP tools that aren't marked read-only under `approval_policy=never`. That's why read-only mode advertises `call_page_tool` as read-only.
10. **Tab tracking starts at install.** Tabs opened before tracking existed are treated as not Secret Menu's (the safe default). If the bridge is down, `stop` requires `--force`.
11. **Local data.** The audit log stores argument previews and digests, not tool results. Arguments you pass (for example a phone number) appear in `argsPreview`. Signed-in sessions live in `~/.secret-menu/chrome-profile/`. Use `secret-menu log --redact` when sharing log lines.
12. **Audit setting and old hosts.** A running native host picks up the audit setting on each request, but a host started from older code keeps auditing until Chrome restarts it.
13. **UI not built yet.** Hand-off "Run in agent" is disabled. Discover categories are guessed by local rules and shown as "(guessed)". The opt-in setup toggles aren't built.
14. **With the WebMCP flag on, every page has `document.modelContext`.** So a site without tools shows "No WebMCP tools on this page" rather than "WebMCP not available".
15. **Not verified live:** the badge's `popup.html?view=page` fallback (unit-tested only).

## Fixed in code, pending live verification

- `secret-menu stop` could kill the wrong pid. Launch, stop and status now find the main Chrome process by its exact `--user-data-dir` argument.
- A stale extension service worker hid code changes. Launch now clears the profile's service worker cache when the extension code changed.
- `open --new URL` treated `--new` as the URL. All commands now share flag parsing.
- `secret-menu mcp` didn't exit when stdin closed.
- Some churn events were duplicated. The background service worker is now the single source of truth for diffs.
- MCP results were double-encoded.
- Approval requests piled up. Matching pending approvals are reused, and recent denials are refused.

## Fixed and verified

- "Page loaded" doesn't mean "tools ready": `--wait-tools` now waits for a quiet window (verified on the fixture).
- Refusals after a deny are now audited.
- `secret-menu stop` no longer closes tabs a person opened.

## Decisions

- **Pass site text through.** Page tool output, including a site's suggested next steps, is returned untouched apart from the 20,000-character cap. The agent's own approval UI is the check on actions that change data or spend money.
- **Safety is opt-in.** The default is `{"guard": false, "audit": false}`. Per-site allowlist and strict entries are always enforced.

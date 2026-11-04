# Safety model

Secret Menu builds roads; it doesn't police them. The checks below run in the command line (`secret-menu call`) and in the MCP server's `call_page_tool`. The helper (Chrome's native messaging host) and the extension pass on what those clients send and don't check policy themselves.

- **Off by default.** Calls run, and your agent's own approval UI decides what needs a yes.
- **`secret-menu safety on`** turns on the guard and the audit log.
  - **Guard:** tools the page doesn't mark read-only need your approval: a prompt or `--yes` on the CLI, or a one-time `secret-menu approve <id>` for MCP, then a retry within ten minutes. The read-only mark (`readOnlyHint`) comes from the page itself, so a tool the page marks read-only runs without a prompt.
  - **Audit:** the helper writes every request the CLI or MCP server sends through it to `audit.jsonl` when it finishes, as a hash chain that `secret-menu verify` checks. Calls the CLI or MCP server refuse are logged too. The popup and Discover read inside the extension and aren't logged.
- **Per-site allowlist** (`~/.secret-menu/sites.json`, edited with `secret-menu allow`) applies to `secret-menu call`, MCP `call_page_tool` and `explain --probe` whether or not safety is on, because adding an entry is itself an opt-in. Listed tools run without a prompt. `--strict` refuses every other tool on that site. MCP read-only mode still refuses an allowlisted tool that looks like it changes data. The allowlist trusts your judgement, not the page.
- **Limits you should know about:**
  - `run_recipe` skips the guard and the allowlist. It only ever calls `search_catalog`, so it runs on a `--strict` site that doesn't list that tool, and with the guard on even if the page doesn't mark it read-only. It's still audited.
  - Any program running as you can talk to the helper's socket (`~/.secret-menu/run/bridge.sock`, readable only by you) directly and skip the guard, the allowlist and read-only mode. The audit log still records those calls when it's on, along with the approval label the program reports.
  - A Chrome started with a remote debugging port (the screenshot harness in [TESTING.md](../TESTING.md) uses one) can be driven without any of these checks. `secret-menu launch` doesn't open one.
  - Approvals that expire unused aren't written to the audit log.
  - The audit anchor (`audit.jsonl.head`) sits next to the log, so someone who can edit both can still hide a truncated log.
  - Allowlisted tools are trusted by name. If a site later changes what a tool does, the allowlist still lets it run.
  - The local data folder holds your signed-in Chrome profile, and tool arguments appear in the audit log. Use `secret-menu log --redact` before sharing log lines.

## Read-only mode

`secret-menu mcp --read-only`, or `--allow-tools search_catalog,get_product`, makes `call_page_tool` refuse tools whose names or labels look like they change a cart, order, checkout or account (and, with `--allow-tools`, any tool not on the list). It's a filter based on names and labels, not a guarantee. In that mode `call_page_tool` is advertised as read-only, so agents don't prompt for every call. `run_recipe` is read-only by design and isn't limited by `--allow-tools`.

Try it with Codex (after setup, with Chrome open):

```sh
codex exec --ephemeral --skip-git-repo-check -s read-only \
  -c 'mcp_servers.secret-menu.command="npx"' \
  -c 'mcp_servers.secret-menu.args=["-y","secret-menu","mcp","--allow-tools","search_catalog,get_product"]' \
  "Compare women's sneakers under \$120 across Allbirds, Glossier and Away. Use the secret-menu tools."
```

## Site directions

**Secret Menu follows each site's own directions.** `call_page_tool` returns the page tool's output untouched, including any next steps the site suggests. For example, Shopify search results end with "Next steps: call add_to_cart …". Secret Menu doesn't strip or rewrite site text. The only change is a 20,000-character cap, marked `truncated: true`. (`run_recipe` is the exception: it returns Secret Menu's own normalized rows.)

See also [PRIVACY.md](../PRIVACY.md) and [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).

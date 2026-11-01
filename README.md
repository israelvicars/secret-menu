# 🗝️ Secret Menu

**Secret Menu connects you and your agent to WebMCP tools across sites.**

Some websites now publish tools for AI agents through WebMCP (`document.modelContext`): "search the catalog", "show a variant", "add to cart". Secret Menu finds those tools in your browser tabs, explains in plain language what they let you do, and lets an agent call them as you, through a local MCP server and a Chrome extension.

> [!IMPORTANT]
> **WebMCP is still experimental, and so is this project.**
>
> - **Stock Chrome barely shows these tools yet.** Without a flag, Chrome only exposes WebMCP tools on sites taking part in the WebMCP origin trial (Chrome 149 to 162, ending March 30, 2027). There is no ship date for WebMCP in stable Chrome yet.
> - **Every test so far ran with the WebMCP flag on.** `secret-menu launch` starts its own Chrome with `--enable-features=WebMCP`. Which sites work in a Chrome without the flag has not been checked.
> - **Today it needs Chrome for Testing on an Apple Silicon Mac.** The launcher only looks for a `mac-arm64` Chrome for Testing build. Other platforms aren't supported yet.
> - **Safety controls are opt-in.** By default calls run, and your agent's own approval prompt is the check. See [Safety model](#safety-model).

## What it does

- **Explain a page.** `secret-menu explain` lists the tools a page registers and groups them into a few abilities: *safe*, *changes the view*, *needs sign-in*, *changes data*, *spends money*. Every ability names the real tool names, and every label says whether it came **from a site hint** (the page's own annotations) or is **guessed** (Secret Menu's rules over names, descriptions and inputs). No model writes any of it.
- **Call tools from the command line.** List, inspect and call a page's tools in a dedicated Chrome session, and watch tools appear and disappear as pages change.
- **Give an agent the tools.** `secret-menu mcp` is a stdio MCP server, so any MCP client (Codex, Claude, Cursor and others) can find sites, open them, read their tools and call them as the signed-in user.
- **See them while browsing.** The Chrome extension shows a small badge on pages that have tools and a toolbar popup listing what the page can do.
- **Learn from use.** Each site you explain is saved to a local index on your machine. There is no crawler and no server.

## Requirements

- An Apple Silicon Mac
- Node.js 22
- Chrome for Testing 156, installed by the command below. Secret Menu runs its own Chrome with its own profile and never touches your everyday Chrome.

## Quickstart

```sh
git clone https://github.com/israelvicars/secret-menu.git
cd secret-menu

# 1. Chrome for Testing, into Secret Menu's data folder
npx @puppeteer/browsers install chrome@156 --path "$HOME/.secret-menu/browsers"

# 2. Build the extension (written to ext/.output/chrome-mv3)
npm --prefix ext install
npm run ext:build

# 3. Serve the built-in test page (http://127.0.0.1:8765/)
./bin/secret-menu serve
```

In a second terminal:

```sh
./bin/secret-menu launch http://127.0.0.1:8765/   # starts the Secret Menu Chrome with the extension
./bin/secret-menu tabs                            # tab ids
./bin/secret-menu tools                           # tools on the active tab
./bin/secret-menu explain --tab <id>              # what those tools let you do
./bin/secret-menu call get_status                 # call one
./bin/secret-menu stop
```

`launch` loads the extension and installs its native messaging host (`com.secretmenu.bridge`) into Secret Menu's own Chrome profile. Sign in to sites inside that Chrome if you want tools that need an account.

## Use it from an agent (MCP)

Add Secret Menu as a stdio MCP server. Use the absolute path to your clone:

```json
{
  "mcpServers": {
    "secret-menu": {
      "command": "node",
      "args": ["/path/to/secret-menu/bin/secret-menu", "mcp"]
    }
  }
}
```

The MCP server works on its own and does more while the Secret Menu Chrome is running (`secret-menu launch`).

| Tool | Needs the browser | What it does |
| --- | --- | --- |
| `find_sites` | No | Search the local index of sites Secret Menu has already explained, for ones that can do a task. |
| `list_recipes` | No | List ready-made multi-site recipes, plus sequences learned from earlier successful sessions. |
| `run_recipe` | Yes | Run a read-only recipe end to end, for example `compare-shopify` to compare products across Shopify stores. |
| `open_site` | Yes | Open a site (or reuse a tab Secret Menu opened), wait for its WebMCP tools, and explain them. |
| `list_tabs` | Yes | List open web tabs in the Secret Menu Chrome. |
| `list_page_tools` | Yes | List a tab's raw WebMCP tools: name, description, input schema, annotations. |
| `explain_page` | Yes | Explain a tab's tools as labelled abilities, with the exact tool names. |
| `call_page_tool` | Yes | Call one WebMCP tool on a tab, as the signed-in user. |

**Secret Menu follows each site's own directions.** `call_page_tool` returns the page tool's output untouched, including any next steps the site suggests. For example, Shopify search results end with "Next steps: call add_to_cart …". Secret Menu doesn't strip or rewrite site text. The only change is a 20,000-character cap, marked `truncated: true`. (`run_recipe` is the exception: it returns Secret Menu's own normalized rows.)

**Read-only mode:** `secret-menu mcp --read-only`, or `--allow-tools search_catalog,get_product`, refuses cart, order, checkout, account and other data-changing tools. In that mode `call_page_tool` is advertised as read-only, so agents don't prompt for every call.

Try it with Codex (run `secret-menu launch` first):

```sh
codex exec --ephemeral --skip-git-repo-check -s read-only \
  -c 'mcp_servers.secret-menu.command="node"' \
  -c 'mcp_servers.secret-menu.args=["/path/to/secret-menu/bin/secret-menu","mcp","--allow-tools","search_catalog,get_product"]' \
  "Compare women's sneakers under \$120 across Allbirds, Glossier and Away. Use the secret-menu tools."
```

## The Chrome extension

The extension lives in `ext/` (WXT, React, Tailwind and shadcn/ui on Base UI). It isn't in the Chrome Web Store yet: `secret-menu launch` loads the local build. After changing it, run `npm run ext:build`, then `secret-menu stop` and `secret-menu launch`.

- **Badge:** a small in-page badge appears only on pages that have tools. Click it to open the popup, or press × to dismiss it.
- **Popup:** each ability shows a title and a label. Expand a row to see its tools, notes and a ready-to-copy agent prompt. **Re-check** reads the tools again. The popup is read-only and never calls page tools.
- **Hand off:** builds an agent prompt from the page's real tools. Changing data and spending money stay off unless you switch them on. "Run in agent" isn't built yet, so copy the prompt into an agent that has Secret Menu connected.
- **Discover:** lists the sites in your local index.
- **Theme:** Light, Dark or System.

## Command line

| Command | What it does |
| --- | --- |
| `launch [--headless] [url...]`, `stop`, `status`, `tabs` | Start, stop and inspect the Secret Menu Chrome |
| `open <url> [--new]`, `reload`, `close [--tab N \| --mine]` | Drive tabs |
| `tools [--tab N] [--json] [--wait-tools]` | List a page's tools |
| `form <tool>`, `call <tool> [--arg k=v] [--args JSON] [--yes]` | Inspect and call a tool |
| `explain [--tab N] [--json] [--seed-allowlist]` | Explain a page's tools as abilities |
| `watch [--tab N] [--for SECONDS]` | Stream tools appearing and disappearing |
| `mcp [--read-only] [--allow-tools a,b]` | Run the stdio MCP server |
| `safety [on\|off]` | Show or change the safety setting |
| `allow`, `disallow`, `sites` | Edit the per-site allowlist |
| `approvals`, `approve <id>`, `deny <id>` | Handle pending MCP approvals (when safety is on) |
| `log [--n 20] [--redact]`, `verify` | Read the audit log and check its hash chain |
| `serve` | Serve the test fixture on `http://127.0.0.1:8765/` |

Run `./bin/secret-menu --help` for the full list. Use `--wait-tools` (with `--settle MS` and `--timeout MS`) on pages that register tools a few seconds after loading.

Secret Menu only closes or navigates tabs it opened itself. `stop` refuses while the Secret Menu Chrome has tabs you opened. It lists them so you can decide, and `stop --force` quits anyway.

## Safety model

Secret Menu builds roads; it doesn't police them.

- **Off by default.** Calls run, and your agent's own approval UI decides what needs a yes.
- **`secret-menu safety on`** turns on the guard and the audit log. Tools the page doesn't mark read-only then need your approval: a prompt or `--yes` on the CLI, or a one-time `secret-menu approve <id>` for MCP, then a retry within ten minutes. Every bridge request is written to `audit.jsonl` as a hash chain that `secret-menu verify` checks.
- **Per-site allowlist** (`~/.secret-menu/sites.json`, edited with `secret-menu allow`) is always enforced, because adding an entry is itself an opt-in. Listed tools run without a prompt. `--strict` refuses every other tool on that site. The allowlist trusts your judgement, not the page.
- **Limits you should know about:**
  - Approvals that expire unused aren't written to the audit log.
  - The audit anchor (`audit.jsonl.head`) sits next to the log, so someone who can edit both can still hide a truncated log.
  - Allowlisted tools are trusted by name. If a site later changes what a tool does, the allowlist still lets it run.
  - The local data folder holds your signed-in Chrome profile, and tool arguments appear in the audit log. Use `secret-menu log --redact` before sharing log lines.

## Configuration

- Data lives in `~/.secret-menu`. Change it with `SECRET_MENU_HOME`.
- `SECRET_MENU_CHROME` overrides Chrome discovery.
- `SECRET_MENU_MCP_READ_ONLY=1` and `SECRET_MENU_MCP_ALLOW_TOOLS=a,b` set MCP read-only mode.

**Renamed from WebMCP Tinker.** `bin/tinker` still works as a deprecated alias. The old `WEBMCP_TINKER_*` and `TINKER_MCP_*` variables are still read, and an existing `~/.webmcp-tinker` folder is copied (never moved or deleted) to `~/.secret-menu` on the first `secret-menu launch`.

## Known issues and limits

- WebMCP and Chrome's API names are experimental and may change.
- Closing the last window of the Secret Menu Chrome stops the bridge. Only `secret-menu launch` recovers, and `watch` goes silent without reconnecting.
- Explain labels are rules, not understanding. Sites that leave their read-only hints off get guessed labels, and sign-in needs aren't always detected.
- Store search is the site's own and can be fuzzy. Glossier, for example, answers "bag" with pet-waste bags. The `compare-shopify` recipe uses simple keyword rules.
- Only top frames and HTTP(S) tabs are inspected. Results are cut at 20,000 characters.
- Tabs opened before Secret Menu started tracking tabs are treated as yours, not Secret Menu's.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the full list and [TESTING.md](TESTING.md) for tests and UI test hooks.

## Development

```sh
npm --prefix ext install
npm test          # Node 22; unit tests, no browser needed
npm run ext:build
```

## Uninstall

```sh
./bin/secret-menu stop
rm -rf "$HOME/.secret-menu"
```

## Credits

The 🗝️ icon is [Twemoji](https://github.com/jdecked/twemoji) "old key" (1f5dd), © Twitter, Inc. and other contributors, used under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [NOTICE.md](NOTICE.md).

## License

[MIT](LICENSE) © 2026 Israel Vicars. The 🗝️ icon is licensed separately under CC-BY 4.0 (see Credits).

# 🗝️ Secret Menu

**Secret Menu connects you and your agent to WebMCP tools across sites.**

Some websites now publish tools for AI agents through WebMCP (`document.modelContext`): "search the catalog", "show a variant", "add to cart". Secret Menu finds those tools in your browser tabs, explains in plain language what they let you do, and lets an agent call them as you, through a local MCP server and a Chrome extension.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/badge-dark.png">
    <img src="docs/screenshots/badge-light.png" width="460" alt="The in-page badge: What more can I do here? 14 WebMCP tools">
  </picture>
</p>

<table>
  <tr>
    <td width="50%"><picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/popup-dark.png">
      <img src="docs/screenshots/popup-light.png" alt="The toolbar popup: the page's tools grouped into abilities labelled safe, needs sign-in, changes data and spends money">
    </picture></td>
    <td width="50%"><picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/popup-expanded-dark.png">
      <img src="docs/screenshots/popup-expanded-light.png" alt="An expanded ability: its tool names, where each label came from, and a ready-to-copy agent prompt">
    </picture></td>
  </tr>
</table>

<sub>The badge and popup on Secret Menu's built-in test page (<code>secret-menu serve</code>), a fake shop with 14 tools. Nothing on it is real.</sub>

> [!IMPORTANT]
> **WebMCP is still experimental, and so is this project.**
>
> - **Stock Chrome barely shows these tools yet.** Without a flag, Chrome only exposes WebMCP tools on sites taking part in the WebMCP origin trial (Chrome 149 to 162, ending March 30, 2027). There is no ship date for WebMCP in stable Chrome yet.
> - **Most testing ran with the WebMCP flag on.** `secret-menu launch` starts its own Chrome with `--enable-features=WebMCP`. In one check without the flag, the test browser (Chrome for Testing 156) still showed tools on three sample stores. Stock Chrome without the flag hasn't been checked.
> - **macOS and Linux only.** `npx secret-menu setup` works with Google Chrome on macOS and Linux. The dedicated test Chrome (`secret-menu launch`, for development) needs an Apple Silicon Mac. Windows isn't supported yet.
> - **Safety controls are opt-in.** By default calls run, and your agent's own approval prompt is the check. See [Safety model](#safety-model).

## What it does

- **Explain a page.** `secret-menu explain` lists the tools a page registers and groups them into a few abilities: *safe*, *changes the view*, *needs sign-in*, *changes data*, *spends money*. Every ability names the real tool names, and every label says whether it came **from a site hint** (the page's own annotations) or is **guessed** (Secret Menu's rules over names, descriptions and inputs). No model writes any of it.
- **Call tools from the command line.** List, inspect and call a page's tools in a dedicated Chrome session, and watch tools appear and disappear as pages change.
- **Give an agent the tools.** `secret-menu mcp` is a stdio MCP server, so any MCP client (Codex, Claude, Cursor and others) can find sites, open them, read their tools and call them as the signed-in user.
- **See them while browsing.** The Chrome extension shows a small badge on pages that have tools and a toolbar popup listing what the page can do.
- **Learn from use.** Each site you explain is saved to a local index on your machine. There is no crawler and no server.

## Requirements

- Node.js 22 or newer
- Google Chrome on macOS or Linux (Windows isn't supported yet)
- The Secret Menu extension in Chrome. A Chrome Web Store listing is coming; until then, load it unpacked (see below).
- Sites that publish WebMCP tools. In stable Chrome that's only sites in the WebMCP origin trial, unless WebMCP is turned on (see the note above).

## Install

There are two parts. The **extension** shows you a page's tools while you browse. The **`secret-menu` package on npm** connects the extension to your computer, so an agent can use those tools. The extension works on its own; the package needs the extension.

### 1. The extension

The Chrome Web Store listing is coming. Until then, build it from this repo and load it unpacked:

```sh
git clone https://github.com/israelvicars/secret-menu.git
cd secret-menu
npm --prefix ext install
npm run ext:build          # written to ext/.output/chrome-mv3
```

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `ext/.output/chrome-mv3`. The build keeps the extension's pinned ID, so setup below finds it without extra flags.

### 2. Set up (once)

```sh
npx secret-menu setup
```

This installs Chrome's native messaging host for Secret Menu (`com.secretmenu.bridge`) and a small launcher under `~/.secret-menu`. It's safe to run again; it says what it wrote or left unchanged. If your extension has a different ID, pass it: `npx secret-menu setup --extension-id <32-letter id>` (or set `SECRET_MENU_EXTENSION_ID`).

Then reload the extension (or restart Chrome).

### 3. Connect your agent

Add Secret Menu as an MCP server in your agent (for example, the MCP settings in Claude Desktop or Cursor):

```json
{
  "mcpServers": {
    "secret-menu": { "command": "npx", "args": ["-y", "secret-menu", "mcp"] }
  }
}
```

Your agent gets tools to list your tabs, read a page's WebMCP tools, explain them in plain words, call them, find sites in the local index, open a site, and run saved recipes (see [MCP tools](#mcp-tools)).

### 4. Check it

```sh
npx secret-menu doctor
```

Each line is `ok` or `FAIL` with a fix: Node version, the native host manifest, the launcher, the extension ID, and whether Chrome's bridge is reachable. It exits non-zero when something fails.

### What you get from each part

- **Extension only:** an in-page badge on pages that have WebMCP tools, and a toolbar popup that explains them as abilities (safe, changes the view, needs sign-in, changes data, spends money), with the real tool names and a ready-to-copy agent prompt. The popup only reads tools; it never calls them. Before setup, Discover and Hand off show a "Connect your agent" step.
- **Extension plus the package:** your agent sees the same tools and labels you do, and its calls run as you on sites you're signed in to. The Hand off page names the page's real tools in a prompt for your agent, and Discover lists the sites in your local index.
- **The MCP server alone** starts without a browser, but then only `find_sites` and `list_recipes` work, from data already on your machine.

### Developing from a clone: the dedicated test Chrome

From a source checkout you can also run Secret Menu in its own Chrome for Testing (Apple Silicon Mac only), with the WebMCP flag on and its own profile, never your everyday Chrome. `launch` and `serve` only work from a clone, not from the npm package.

```sh
npx @puppeteer/browsers install chrome@156 --path "$HOME/.secret-menu/browsers"
./bin/secret-menu launch     # opens the Secret Menu Chrome with the extension loaded
./bin/secret-menu stop
```

### Try it on the test page

```sh
./bin/secret-menu serve                           # test page on http://127.0.0.1:8765/
```

In a second terminal:

```sh
./bin/secret-menu launch http://127.0.0.1:8765/
./bin/secret-menu tabs                            # tab ids
./bin/secret-menu tools                           # tools on the active tab
./bin/secret-menu explain --tab <id>              # what those tools let you do
./bin/secret-menu call get_status                 # call one
./bin/secret-menu stop
```

## MCP tools

| Tool | Needs the Secret Menu Chrome | What it does |
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

**Read-only mode:** `secret-menu mcp --read-only`, or `--allow-tools search_catalog,get_product`, makes `call_page_tool` refuse tools whose names or labels look like they change a cart, order, checkout or account (and, with `--allow-tools`, any tool not on the list). It's a filter based on names and labels, not a guarantee. In that mode `call_page_tool` is advertised as read-only, so agents don't prompt for every call. `run_recipe` is read-only by design and isn't limited by `--allow-tools`.

Try it with Codex (after setup, with Chrome open):

```sh
codex exec --ephemeral --skip-git-repo-check -s read-only \
  -c 'mcp_servers.secret-menu.command="npx"' \
  -c 'mcp_servers.secret-menu.args=["-y","secret-menu","mcp","--allow-tools","search_catalog,get_product"]' \
  "Compare women's sneakers under \$120 across Allbirds, Glossier and Away. Use the secret-menu tools."
```

## The Chrome extension

The extension lives in `ext/` (WXT, React, Tailwind and shadcn/ui on Base UI). Its Chrome Web Store listing is coming; until then, load the local build unpacked. After changing it, run `npm run ext:build` and reload it (or `secret-menu stop` and `secret-menu launch` in the test Chrome).

- **Badge:** a small in-page badge appears only on pages that have tools. Click it to open the popup, or press × to dismiss it.
- **Popup:** each ability shows a title and a label. Expand a row to see the full title, its tools, notes and a ready-to-copy agent prompt. **Re-check** reads the tools again. The popup is read-only and never calls page tools.
- **Before setup:** the extension works on its own; Discover and Hand off show a "Connect your agent" step with `npx secret-menu setup`.
- **Hand off:** builds an agent prompt from the page's real tools, grouped by what they let you do. Changing data and spending money stay off unless you switch them on. "Run in agent" isn't built yet, so copy the prompt into an agent that has Secret Menu connected.
- **Discover:** lists the sites in your local index.
- **Theme:** one button cycles Light, Dark and System.

## Command line

| Command | What it does |
| --- | --- |
| `launch [--headless] [url...]`, `stop [--force] [--timeout SECONDS] [--kill]`, `status`, `tabs` | Start, stop and inspect the Secret Menu Chrome |
| `open <url> [--new]`, `reload`, `close [--tab N \| --mine]` | Drive tabs |
| `tools [--tab N] [--json] [--wait-tools]` | List a page's tools, with the same five labels as the popup |
| `form <tool>`, `call <tool> [--arg k=v] [--args JSON] [--yes]` | Inspect and call a tool |
| `explain [--tab N] [--json] [--seed-allowlist]` | Explain a page's tools as abilities |
| `watch [--tab N] [--for SECONDS]` | Stream tools appearing and disappearing |
| `mcp [--read-only] [--allow-tools a,b]` | Run the stdio MCP server |
| `safety [on\|off]` | Show or change the safety setting |
| `allow`, `disallow`, `sites` | Edit the per-site allowlist |
| `approvals`, `approve <id>`, `deny <id>` | Handle pending MCP approvals (when safety is on) |
| `log [--n 20] [--redact]`, `verify` | Read the audit log and check its hash chain |
| `setup [--extension-id ID]`, `doctor`, `uninstall` | Install, check and remove the native messaging host for your Chrome |
| `serve` | Serve the test fixture on `http://127.0.0.1:8765/` (from a clone) |

Run `npx secret-menu --help` (or `./bin/secret-menu --help` in a clone) for the full list. Use `--wait-tools` (with `--settle MS` and `--timeout MS`) on pages that register tools a few seconds after loading.

Secret Menu only closes or navigates tabs it opened itself: tabs from `open --new`, `explain <url>`, MCP `open_site`, and the tabs `launch <url...>` opens. `close` and `open` refuse other tabs unless you add `--force` (`reload` reloads whichever tab you point it at). `stop` refuses while the Secret Menu Chrome has tabs you opened. It lists them so you can decide, and `stop --force` quits anyway.

`stop` sends SIGTERM and waits up to `--timeout` seconds (default 8). It only force-kills Chrome if you pass `--kill`; otherwise a Chrome that is still running is reported and `stop` exits with code 4.

## Safety model

Secret Menu builds roads; it doesn't police them. The checks below run in the command line (`secret-menu call`) and in the MCP server's `call_page_tool`. The native messaging host and the extension pass on what those clients send and don't check policy themselves.

- **Off by default.** Calls run, and your agent's own approval UI decides what needs a yes.
- **`secret-menu safety on`** turns on the guard and the audit log.
  - **Guard:** tools the page doesn't mark read-only need your approval: a prompt or `--yes` on the CLI, or a one-time `secret-menu approve <id>` for MCP, then a retry within ten minutes. The read-only mark (`readOnlyHint`) comes from the page itself, so a tool the page marks read-only runs without a prompt.
  - **Audit:** the native host writes every request the CLI or MCP server sends through the bridge to `audit.jsonl` when it finishes, as a hash chain that `secret-menu verify` checks. Calls the CLI or MCP server refuse are logged too. The popup and Discover read inside the extension and aren't logged.
- **Per-site allowlist** (`~/.secret-menu/sites.json`, edited with `secret-menu allow`) applies to `secret-menu call`, MCP `call_page_tool` and `explain --probe` whether or not safety is on, because adding an entry is itself an opt-in. Listed tools run without a prompt. `--strict` refuses every other tool on that site. MCP read-only mode still refuses an allowlisted tool that looks like it changes data. The allowlist trusts your judgement, not the page.
- **Limits you should know about:**
  - `run_recipe` skips the guard and the allowlist. It only ever calls `search_catalog`, so it runs on a `--strict` site that doesn't list that tool, and with the guard on even if the page doesn't mark it read-only. It's still audited.
  - Any program running as you can talk to the bridge socket (`~/.secret-menu/run/bridge.sock`, readable only by you) directly and skip the guard, the allowlist and read-only mode. The audit log still records those calls when it's on, along with the approval label the program reports.
  - A Chrome started with a remote debugging port (the screenshot harness in [TESTING.md](TESTING.md) uses one) can be driven without any of these checks. `secret-menu launch` doesn't open one.
  - Approvals that expire unused aren't written to the audit log.
  - The audit anchor (`audit.jsonl.head`) sits next to the log, so someone who can edit both can still hide a truncated log.
  - Allowlisted tools are trusted by name. If a site later changes what a tool does, the allowlist still lets it run.
  - The local data folder holds your signed-in Chrome profile, and tool arguments appear in the audit log. Use `secret-menu log --redact` before sharing log lines.

## Configuration

- Data lives in `~/.secret-menu`. Change it with `SECRET_MENU_HOME`.
- `SECRET_MENU_CHROME` overrides Chrome discovery.
- `SECRET_MENU_MCP_READ_ONLY=1` and `SECRET_MENU_MCP_ALLOW_TOOLS=a,b` set MCP read-only mode.

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

Optional, for desktop UI tests only (never needed to run Secret Menu): [agent-desktop](https://www.npmjs.com/package/agent-desktop), installed with `npm i -g agent-desktop`. On macOS, give Accessibility and Screen Recording (System Settings > Privacy & Security) to the app that launches it. [TESTING.md](TESTING.md) lists the UI hooks those tests can rely on.

## Uninstall

```sh
npx secret-menu uninstall
```

This removes only what setup wrote (the native host manifest, if it still points at Secret Menu, and the launcher). Your data in `~/.secret-menu` stays; delete that folder to remove it. Then remove the extension from Chrome. If you used the test Chrome from a clone, run `./bin/secret-menu stop` first.

## Credits

The 🗝️ icon is [Twemoji](https://github.com/jdecked/twemoji) "old key" (1f5dd), © Twitter, Inc. and other contributors, used under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [NOTICE.md](NOTICE.md).

## License

[MIT](LICENSE) © 2026 Israel Vicars. The 🗝️ icon is licensed separately under CC-BY 4.0 (see Credits).

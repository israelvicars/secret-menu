<!-- Draft README for the npm package `secret-menu`. Not published. Merge into the publish overlay README
     (secret-menu-publish-tools/overlay/README.md) before packing from the staging tree. TODOs are for review. -->

# 🗝️ Secret Menu

**Let your AI agent use the tools websites publish for agents, in your own Chrome, with the risky ones behind your yes.**

Some sites now expose tools for AI agents through WebMCP (`document.modelContext`): search products, see your
orders, change a profile, check out. The Secret Menu Chrome extension shows you what a page's tools let you do in
plain words. This package connects that extension to your computer, so an agent (Claude Desktop, Cursor, Codex or
any MCP client) can list and call those tools through a local MCP server.

Everything runs locally. No account, no server, no telemetry, no dependencies.

## Requirements

- Node.js 22 or newer
- Google Chrome on macOS or Linux (Windows isn't supported yet)
- The Secret Menu extension in Chrome <!-- TODO: Chrome Web Store link once listed -->
- Sites that publish WebMCP tools <!-- TODO: say whether Chrome needs chrome://flags/#enable-webmcp (or similar) on stable -->

## Set up (once)

```sh
npx secret-menu setup
```

This installs Chrome's native messaging host for Secret Menu (`com.secretmenu.bridge`) and a small launcher under
`~/.secret-menu`. It's safe to run again; it says what it wrote or left unchanged. If you load the extension
unpacked under a different ID, pass it: `npx secret-menu setup --extension-id <32-letter id>` (or set
`SECRET_MENU_EXTENSION_ID`).

Then reload the extension (or restart Chrome).

## Connect your agent

Add Secret Menu as an MCP server in your agent:

```json
{
  "mcpServers": {
    "secret-menu": { "command": "npx", "args": ["-y", "secret-menu", "mcp"] }
  }
}
```

Your agent gets tools to list your tabs, read a page's WebMCP tools, explain them in plain words, call them, find
sites in the local index, open a site, and run saved recipes.

## Check it

```sh
npx secret-menu doctor
```

Each line is `ok` or `FAIL` with a fix: Node version, the native host manifest, the launcher, the extension ID, and
whether Chrome's bridge is reachable. It exits non-zero when something fails.

## What you see in Chrome

- **Popup:** what this page's tools let you do, each with a label (safe, needs sign-in, changes data, spends money).
- **Hand off:** turns what you want done into a prompt that names the page's real tools. Changing data and spending
  money stay off unless you switch them on.
- **Discover:** sites in your local index that publish tools.

Before setup, the extension still works on its own; Discover and Hand off show a "Connect your agent" step.

## Safety

By default your agent's own approval UI decides what needs a yes. Turn on Secret Menu's guard with
`npx secret-menu safety on`: tools a page doesn't mark read-only then need your approval, and every call is logged
to `~/.secret-menu/audit.jsonl` (`npx secret-menu log`, `npx secret-menu verify`). Per-site allowlists:
`npx secret-menu allow <origin> <tool...>`.

## Uninstall

```sh
npx secret-menu uninstall
```

Removes only what setup wrote (the native host manifest, if it still points at Secret Menu, and the launcher). Your
data in `~/.secret-menu` stays; delete that folder to remove it. Then remove the extension from Chrome.

## More commands

`npx secret-menu --help` lists everything: `tabs`, `tools`, `call`, `explain`, `watch` and more.
`launch` and `serve` are for developing Secret Menu from a source checkout and don't work from the npm package.

## License

MIT. See LICENSE.

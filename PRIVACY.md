# Secret Menu privacy policy

_Effective November 4, 2026. Applies to the Secret Menu Chrome extension and the `secret-menu` npm package._

**Short version:** Secret Menu works only on your computer. It has no servers, no accounts, no analytics and no telemetry. It doesn't send what it reads anywhere. The one exception is when your own AI agent asks it to: it then passes page tools to that agent through a helper that runs on your computer.

## What the extension reads

On http and https pages, the extension's content scripts read:
- **The page's WebMCP tools**: the tools the site itself registers. That means each tool's name, description, input schema and annotations, such as read-only or destructive. This is how the popup lists what the page lets you do.
- **A little page context** to describe the site: the page URL, the title, the meta description and Open Graph tags, the canonical link, and the first three `h1` headings. Each is cut to a few hundred characters.
- **Tab information**: the tab's URL, title and ID, used to show the right page in the popup and hand-off.

It doesn't read cookies, passwords, form contents, your browsing history or other tabs in the background. It also doesn't read page text beyond the context listed above.

**Calling tools.** The extension calls a page's WebMCP tools only when you ask it to, or when your local agent does through the helper described below. A tool call is the site's own code running in your signed-in session, so it can do what the site's tool does, such as search, add to cart or check out. Secret Menu sorts each tool as read-only, sign-in, changes data or spends money. Through its optional safety settings, it can ask you before risky calls.

## What it stores

**In the browser:**
- `chrome.storage.local`: your theme choice (Light, Dark or System). The extension's own pages also mirror this choice in their `localStorage`.
- `chrome.storage.session`: the result of the last "open" action from the on-page badge. It is cleared when the browser closes.

**On your computer, only once you install the optional helper (`npx secret-menu setup`):**

Everything is under `~/.secret-menu/` in your home folder:
- `index/<site>.json`: the **local index** of sites you or your agent have explained (with `secret-menu explain` or the agent's `explain_page` and `open_site`). It holds each site's origin, title, description, tool names, ability titles and tool counts. It does not hold tool results or the values you or your agent typed.
- `recipes/candidates.json`: sequences of tool names that worked together, with the sites and argument **names** (not values), so repeated tasks can be suggested as recipes.
- `audit.jsonl`: written only if you turn on the safety audit. Each tool call gets one line:
  - time, caller, site and URL;
  - tool name;
  - a digest and the first 200 characters of the arguments;
  - the approval decision and outcome;
  - the result size;
  - the duration.
- `run/bridge.sock` and `run/native-host.log`: the local connection and its diagnostic log.

You can delete any of this at any time by deleting `~/.secret-menu/`. `npx secret-menu uninstall` removes the helper registration.

## The native host and local socket

The optional helper is a small Node.js program that Chrome starts through native messaging. Chrome lets only Secret Menu's extension ID talk to it. The helper opens a Unix socket at `~/.secret-menu/run/bridge.sock` that only your user account can open (mode 600). Your AI agent connects to that socket through the `secret-menu mcp` server, which it starts on your computer. Nothing listens on a network port.

## What leaves your computer

- **Secret Menu sends nothing anywhere.** There are no network requests in the extension, the helper or the CLI: no `fetch`, XHR, WebSocket, beacon or analytics code. It has no telemetry, crash reporting or remote configuration.
- **Your AI agent** sees what you hand it: the agent prompt you copy, and the tool lists and tool results it asks for through the local MCP server. What your agent does with that is covered by your agent's own policy, such as Claude Desktop's or Cursor's.
- **The sites themselves.** When a page tool runs, it is the site's code talking to the site's servers, just as if you had clicked the button on the page. Likewise, when your agent opens a site (for example, a built-in recipe that opens a store such as Allbirds), that is an ordinary page load in your browser.
- **Installing.** Installing from the Chrome Web Store or npm downloads Secret Menu from those services, under their own terms.

## Data sharing and sale

Secret Menu's maker collects no data, so there is nothing to sell, share or transfer. The extension's use of data is limited to its single purpose: showing the WebMCP tools a web page offers, explaining what they let you do, and optionally handing them to your own local AI agent.

## Changes and contact

Any change to this policy will be made in this file, with a new effective date, and is visible in the repository's history.

Questions or concerns: open an issue at https://github.com/israelvicars/secret-menu/issues.

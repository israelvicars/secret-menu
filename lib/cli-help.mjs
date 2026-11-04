export const TAGLINE = "🗝️ Secret Menu connects you and your agent to WebMCP tools across sites.";

export const COMMANDS = [
  { name: "setup", group: "Setup", usage: "setup [--extension-id ID]", summary: "Connect the Secret Menu extension in your Chrome to this computer (run once)", details: "Installs the native messaging host for your own Chrome (macOS, Linux). The extension ID comes from --extension-id, then SECRET_MENU_EXTENSION_ID, then the ID pinned by the extension's manifest key (ext/EXTENSION_ID). Safe to run again." },
  { name: "doctor", group: "Setup", usage: "doctor [--extension-id ID]", summary: "Check Node, the native host manifest, the extension ID and the bridge" },
  { name: "uninstall", group: "Setup", usage: "uninstall", summary: "Remove what setup wrote (keeps your data)" },
  { name: "launch", group: "Browser", usage: "launch [--headless] [url...]", summary: "Open the Secret Menu Chrome (test profile), optionally at URLs" },
  { name: "stop", group: "Browser", usage: "stop [--force] [--timeout SECONDS] [--kill]", summary: "Stop Secret Menu Chrome after checking for foreign tabs", details: "Sends SIGTERM and waits (default 8s); exits 4 if Chrome is still up. --kill escalates to SIGKILL; --force skips the foreign-tab check." },
  { name: "status", group: "Browser", usage: "status", summary: "Show Chrome, bridge, extension, and host status" },
  { name: "host-pid", group: "Browser", usage: "host-pid", summary: "Print the native host pid" },
  { name: "tabs", group: "Browser", usage: "tabs", summary: "List tabs in Secret Menu Chrome" },
  { name: "open", group: "Browser", usage: "open <url> [--tab N] [--new] [--wait-tools]", summary: "Open or navigate to a web page" },
  { name: "reload", group: "Browser", usage: "reload [--tab N] [--wait-tools]", summary: "Reload a tab" },
  { name: "close", group: "Browser", usage: "close --tab N [--force] | close --mine", summary: "Close a Secret Menu tab" },
  { name: "tools", group: "Tools", usage: "tools [--tab N] [--wait-tools] [--json]", summary: "List a page's WebMCP tools with plain safety labels" },
  { name: "form", group: "Tools", usage: "form <tool> [--tab N]", summary: "Show one tool's inputs and an example call" },
  { name: "call", group: "Tools", usage: "call <tool> [--tab N] [--arg k=v] [--args JSON] [--yes] [--json]", summary: "Call a page tool" },
  { name: "watch", group: "Tools", usage: "watch [--tab N] [--for SECONDS]", summary: "Watch a tab's WebMCP tool discovery" },
  { name: "explain", group: "Tools", usage: "explain [<http(s) url> | --tab N] [--json] [--seed-allowlist]", summary: "Explain what a tab's WebMCP tools let you do, in plain labels" },
  { name: "safety", group: "Safety", usage: "safety [on|off|status]", summary: "Show or change the approval guard and audit setting" },
  { name: "sites", group: "Safety", usage: "sites [--json]", summary: "List site tool policies" },
  { name: "allow", group: "Safety", usage: "allow <origin> [tool...] [--strict | --no-strict]", summary: "Add a site to the allowlist, optionally with named tools or strict mode" },
  { name: "disallow", group: "Safety", usage: "disallow <origin> [tool...]", summary: "Remove a site's allowed tools or policy" },
  { name: "approvals", group: "Safety", usage: "approvals", summary: "List pending MCP approvals" },
  { name: "approve", group: "Safety", usage: "approve <id>", summary: "Approve a pending MCP call" },
  { name: "deny", group: "Safety", usage: "deny <id>", summary: "Deny a pending MCP call" },
  { name: "log", group: "Safety", usage: "log [--n N] [--redact]", summary: "Print recent audit records" },
  { name: "verify", group: "Safety", usage: "verify", summary: "Verify the audit log hash chain" },
  { name: "mcp", group: "Other", usage: "mcp [--read-only] [--allow-tools LIST]", summary: "Run the MCP server so your agent can use page tools" },
  { name: "serve", group: "Other", usage: "serve", summary: "Host test fixtures on 127.0.0.1:8765" },
];

export function commandEntry(name) { return COMMANDS.find((command) => command.name === name); }

export function helpText(dataHome) {
  const groups = ["Setup", "Browser", "Tools", "Safety", "Other"];
  const lines = [TAGLINE, "", "Start here:",
    "  secret-menu setup           Connect the extension in your Chrome to this computer (once)",
    "  secret-menu mcp             Run the MCP server so your agent can use page tools",
    "  secret-menu doctor          Check that everything is connected",
    "",
    "Or try it in a separate test Chrome:",
    "  secret-menu launch          Open the Secret Menu Chrome (test profile) with the extension",
    "  secret-menu explain --tab N What a tab's WebMCP tools let you do, in plain labels", "", "Commands:"];
  for (const group of groups) {
    lines.push(`  ${group}:`);
    for (const command of COMMANDS.filter((entry) => entry.group === group)) lines.push(`    ${command.name.padEnd(12)}${command.summary}`);
  }
  lines.push("", "Run secret-menu <command> --help for options.", `Data: ${dataHome} (SECRET_MENU_HOME to change).`);
  return lines.join("\n");
}

export function commandHelp(name) {
  const command = commandEntry(name);
  return command ? [`usage: secret-menu ${command.usage}`, command.summary, command.details].filter(Boolean).join("\n") : null;
}

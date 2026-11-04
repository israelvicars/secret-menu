// secret-menu setup / doctor / uninstall: register the Secret Menu native host with the user's own Chrome
// (not the test profile `launch` uses), so the store-installed extension can reach `secret-menu mcp`.
// Everything is computed from the arguments at call time, so tests can point HOME and SECRET_MENU_HOME at temp dirs.
import { createHash } from "node:crypto";
import { accessSync, chmodSync, constants, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOST_NAME = "com.secretmenu.bridge";
export const DEFAULT_EXTENSION_ID = "jfeobmnppdjonobichecmfkabddogeim";
export const STORE_EXTENSION_ID = null; // Fill in (32 letters a-p) once the Chrome Web Store assigns the listing's ID.
export const KNOWN_EXTENSION_IDS = [DEFAULT_EXTENSION_ID, STORE_EXTENSION_ID].filter(Boolean);
export const EXTENSION_ID_RE = /^[a-p]{32}$/;
export const MIN_NODE_MAJOR = 22;
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// What the stable copy needs to run host/native-host.mjs without the npx cache (host imports ../lib/*).
const APP_PARTS = ["host", "lib", "bin", "package.json", join("ext", "EXTENSION_ID")];

const BROWSER_FOLDERS = {
  chrome: { mac: "Google/Chrome", linux: "google-chrome" },
  "chrome-beta": { mac: "Google/Chrome Beta", linux: "google-chrome-beta" },
  "chrome-dev": { mac: "Google/Chrome Dev", linux: "google-chrome-unstable" },
  "chrome-canary": { mac: "Google/Chrome Canary", linux: null },
  chromium: { mac: "Chromium", linux: "chromium" },
};
export const SUPPORTED_BROWSERS = Object.keys(BROWSER_FOLDERS);

function browserPlatform(platform) {
  if (platform === "darwin") return "mac";
  if (platform === "linux") return "linux";
  if (platform === "win32") throw new Error("secret-menu setup does not support Windows yet (Chrome there needs a registry key, and the bridge needs a named pipe). macOS and Linux are supported.");
  throw new Error(`secret-menu setup does not support ${platform} yet. macOS and Linux are supported.`);
}

export function browserDataDir({ browser = "chrome", platform = process.platform, home = homedir(), env = process.env } = {}) {
  if (!BROWSER_FOLDERS[browser]) throw new Error(`Unknown browser ${JSON.stringify(browser)}. Valid names: ${SUPPORTED_BROWSERS.join(", ")}, all.`);
  const folder = BROWSER_FOLDERS[browser][browserPlatform(platform)];
  if (!folder) throw new Error(`${browser} is not supported on Linux. Valid Linux browsers: chrome, chrome-beta, chrome-dev, chromium.`);
  if (platform === "darwin") return join(home, "Library", "Application Support", folder);
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), folder);
}

// Where a Chromium browser looks for per-user native messaging host manifests.
export function chromeHostsDir({ platform = process.platform, home = homedir(), env = process.env, browser = "chrome" } = {}) {
  return join(browserDataDir({ browser, platform, home, env }), "NativeMessagingHosts");
}

export function resolveBrowsers({ browsers = [], platform = process.platform, home = homedir(), env = process.env, detect = true } = {}) {
  const requested = browsers.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  for (const browser of requested) {
    if (browser !== "all" && !SUPPORTED_BROWSERS.includes(browser)) throw new Error(`Unknown browser ${JSON.stringify(browser)}. Valid names: ${SUPPORTED_BROWSERS.join(", ")}, all.`);
    if (browser !== "all") browserDataDir({ browser, platform, home, env });
  }
  let names;
  if (requested.includes("all")) names = SUPPORTED_BROWSERS.filter((browser) => BROWSER_FOLDERS[browser][browserPlatform(platform)]);
  else if (requested.length) names = requested;
  else if (detect) names = SUPPORTED_BROWSERS.filter((browser) => BROWSER_FOLDERS[browser][browserPlatform(platform)] && existsSync(browserDataDir({ browser, platform, home, env })));
  else names = [];
  return [...new Set(names.length ? names : ["chrome"])];
}

export function resolveExtensionIds({ flags = [], env = process.env } = {}) {
  const hasFlags = flags.length > 0;
  const source = hasFlags ? "--extension-id" : env.SECRET_MENU_EXTENSION_ID ? "SECRET_MENU_EXTENSION_ID" : "default (the extension's pinned ID)";
  const extra = (hasFlags ? flags : env.SECRET_MENU_EXTENSION_ID ? String(env.SECRET_MENU_EXTENSION_ID).split(",") : []).flatMap((value) => String(value).split(","));
  const ids = [];
  for (const value of [...extra, ...KNOWN_EXTENSION_IDS]) {
    const trimmed = String(value).trim();
    if (!EXTENSION_ID_RE.test(trimmed)) throw new Error(`Not a Chrome extension ID (${source}): ${JSON.stringify(trimmed)}. IDs are 32 letters a-p, shown on chrome://extensions with Developer mode on.`);
    if (!ids.includes(trimmed)) ids.push(trimmed);
  }
  return { ids, source };
}

export function setupPaths({ dataHome, platform, home, env, browser = "chrome" } = {}) {
  const dir = join(dataHome, "native-host", "setup");
  return { dir, app: join(dir, "app"), launcher: join(dir, "secret-menu-host"), receipt: join(dir, "setup.json"), browser, hostsDir: chromeHostsDir({ platform, home, env, browser }), get manifest() { return join(this.hostsDir, `${HOST_NAME}.json`); } };
}

const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
// Write only when the content differs; report which.
function writeIfChanged(path, text, mode) {
  if (readText(path) === text) { if (mode) chmodSync(path, mode); return "unchanged"; }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text, mode ? { mode } : undefined);
  if (mode) chmodSync(tmp, mode);
  renameSync(tmp, path);
  return "wrote";
}
// Content hash of the parts the host needs, so setup re-copies exactly when the code changed.
function treeHash(root) {
  const hash = createHash("sha256");
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) { for (const name of readdirSync(abs).sort()) walk(join(rel, name)); return; }
    hash.update(`${rel}\0`); hash.update(readFileSync(abs)); hash.update("\0");
  };
  for (const part of APP_PARTS) walk(part);
  return hash.digest("hex");
}

export function manifestFor({ launcher, extensionIds }) {
  return { name: HOST_NAME, description: "Secret Menu local bridge", path: launcher, type: "stdio", allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`) };
}

export function setup({ dataHome, extensionIds, browsers = [], browser, platform = process.platform, home = homedir(), env = process.env, nodePath = process.execPath, pkgRoot = PKG_ROOT } = {}) {
  const browserNames = resolveBrowsers({ browsers: browser ? [browser] : browsers, platform, home, env });
  const p = setupPaths({ dataHome, platform, home, env, browser: browserNames[0] });
  const actions = [];
  // 1. A stable copy of the host code, outside the npx cache (which npm may clear at any time).
  if (existsSync(p.app) && treeHash(p.app) === treeHash(pkgRoot)) actions.push(["unchanged", p.app]);
  else {
    const staging = `${p.app}.tmp-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true, mode: 0o700 });
    for (const part of APP_PARTS) if (existsSync(join(pkgRoot, part))) cpSync(join(pkgRoot, part), join(staging, part), { recursive: true });
    rmSync(p.app, { recursive: true, force: true });
    renameSync(staging, p.app);
    actions.push(["wrote", p.app]);
  }
  // 2. The launcher Chrome runs: absolute node path, our data home, the stable host script.
  const script = join(p.app, "host", "native-host.mjs");
  const launcherText = `#!/bin/sh\n# Written by secret-menu setup. Remove with: secret-menu uninstall\nSECRET_MENU_HOME=${shQuote(dataHome)}\nexport SECRET_MENU_HOME\nexec ${shQuote(nodePath)} ${shQuote(script)} "$@"\n`;
  actions.push([writeIfChanged(p.launcher, launcherText, 0o700), p.launcher]);
  // 3. The Chrome manifest. Note when it replaces one that points somewhere else (e.g. a dev checkout).
  const manifests = [];
  for (const name of browserNames) {
    const browserPath = setupPaths({ dataHome, platform, home, env, browser: name });
    const existing = readJson(browserPath.manifest);
    const replaced = existing && existing.path && existing.path !== p.launcher ? existing.path : null;
    const manifestText = `${JSON.stringify(manifestFor({ launcher: p.launcher, extensionIds }), null, 2)}\n`;
    actions.push([writeIfChanged(browserPath.manifest, manifestText), browserPath.manifest]);
    manifests.push({ browser: name, hostsDir: browserPath.hostsDir, manifest: browserPath.manifest, replaced });
  }
  const replaced = manifests.find((item) => item.replaced)?.replaced ?? null;
  // 4. A receipt, so uninstall removes only what setup wrote.
  const receipt = { manifests: manifests.map((item) => item.manifest), manifest: manifests[0].manifest, launcher: p.launcher, app: p.app, extensionIds, node: nodePath };
  actions.push([writeIfChanged(p.receipt, `${JSON.stringify(receipt, null, 2)}\n`), p.receipt]);
  return { ...p, manifest: p.manifest, actions, replaced, extensionIds, browsers: manifests };
}

export function uninstall({ dataHome, browsers = [], browser, platform = process.platform, home = homedir(), env = process.env } = {}) {
  const names = resolveBrowsers({ browsers: browser ? [browser] : browsers, platform, home, env });
  const p = setupPaths({ dataHome, platform, home, env, browser: names[0] });
  const receipt = readJson(p.receipt);
  const receiptManifests = receipt?.manifests ?? (receipt?.manifest ? [receipt.manifest] : []);
  const actions = [];
  // Without --browser, also clean every manifest the last setup recorded, even if its browser folder is gone.
  const explicit = (browser ? [browser] : browsers).length > 0;
  const paths = [...new Set([...names.map((name) => setupPaths({ dataHome, platform, home, env, browser: name }).manifest), ...(explicit ? [] : receiptManifests)])];
  for (const manifestPath of paths) {
    const m = readJson(manifestPath);
    if (m && m.path === p.launcher) { rmSync(manifestPath, { force: true }); actions.push(["removed", manifestPath]); }
    else if (m) actions.push(["kept", `${manifestPath} (points at ${m.path}, not written by setup)`]);
    else actions.push(["absent", manifestPath]);
  }
  // Keep the launcher while another browser's manifest (from the last setup) still points at it.
  const remaining = receiptManifests.filter((path) => !paths.includes(path) && readJson(path)?.path === p.launcher);
  if (remaining.length) {
    writeIfChanged(p.receipt, `${JSON.stringify({ ...receipt, manifests: remaining, manifest: remaining[0] }, null, 2)}\n`);
    actions.push(["kept", `${p.dir} (still used by ${remaining.join(", ")})`]);
  } else if (existsSync(p.dir)) { rmSync(p.dir, { recursive: true, force: true }); actions.push(["removed", p.dir]); }
  else actions.push(["absent", p.dir]);
  return { actions };
}

function socketReachable(path, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!existsSync(path)) return resolve({ ok: false, why: "no socket file" });
    const s = connect(path);
    const done = (r) => { clearTimeout(t); s.destroy(); resolve(r); };
    const t = setTimeout(() => done({ ok: false, why: "timed out" }), timeoutMs);
    s.once("connect", () => done({ ok: true }));
    s.once("error", (e) => done({ ok: false, why: e.code ?? e.message }));
  });
}

// Each check: { ok, label, fix? }. Bridge reachability is informational when nothing else failed:
// the bridge only runs while Chrome has the extension loaded.
export async function doctor({ dataHome, socketPath, extensionIds, browsers = [], browser, platform = process.platform, home = homedir(), env = process.env, nodeVersion = process.versions.node } = {}) {
  const checks = [];
  const add = (ok, label, fix) => checks.push({ ok, label, ...(ok ? {} : { fix }) });
  const major = Number(String(nodeVersion).split(".")[0]);
  add(major >= MIN_NODE_MAJOR, `Node ${nodeVersion} (needs ${MIN_NODE_MAJOR}+)`, `Install Node ${MIN_NODE_MAJOR} or newer (https://nodejs.org).`);
  let p, browserNames;
  try { browserNames = resolveBrowsers({ browsers: browser ? [browser] : browsers, platform, home, env }); p = setupPaths({ dataHome, platform, home, env, browser: browserNames[0] }); }
  catch (e) { add(false, "Platform supported", e.message); return checks; }
  const setupFix = "Run: npx -y secret-menu setup";
  for (const name of browserNames) {
    const browserPath = setupPaths({ dataHome, platform, home, env, browser: name });
    const manifest = readJson(browserPath.manifest);
    if (!existsSync(browserPath.manifest)) { add(false, `Native host manifest at ${browserPath.manifest}${browserNames.length > 1 ? ` (${name})` : ""}`, setupFix); continue; }
    if (!manifest) { add(false, `Native host manifest parses (${browserPath.manifest})`, `The file is not valid JSON. ${setupFix}`); continue; }
    add(true, `Native host manifest at ${browserPath.manifest}${browserNames.length > 1 ? ` (${name})` : ""}`);
    add(manifest.name === HOST_NAME, `Manifest name is ${HOST_NAME}${browserNames.length > 1 ? ` (${name})` : ""}`, setupFix);
    let exec = false;
    try { exec = statSync(manifest.path).isFile(); accessSync(manifest.path, constants.X_OK); } catch { exec = false; }
    add(exec, `Manifest points at an executable (${manifest.path})${browserNames.length > 1 ? ` (${name})` : ""}`, setupFix);
    if (exec && manifest.path === browserPath.launcher) {
      const text = readText(browserPath.launcher) ?? "";
      const quoted = [...text.matchAll(/^exec '((?:[^']|'\\'')*)' '((?:[^']|'\\'')*)'/gm)][0];
      const unq = (s) => s.replace(/'\\''/g, "'");
      const node = quoted && unq(quoted[1]), script = quoted && unq(quoted[2]);
      add(!!node && existsSync(node), `Launcher's Node exists (${node ?? "unknown"})`, `Node moved or was removed (nvm upgrade?). ${setupFix}`);
      add(!!script && existsSync(script), `Launcher's host script exists (${script ?? "unknown"})`, setupFix);
    }
    const origins = Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins : [];
    const missing = extensionIds.filter((id) => !origins.includes(`chrome-extension://${id}/`));
    const label = extensionIds.length === 1 ? `Manifest allows extension ${extensionIds[0]}` : `Manifest allows extensions ${extensionIds.join(", ")}`;
    const suggested = missing.filter((id) => !KNOWN_EXTENSION_IDS.includes(id)).map((id) => `--extension-id ${id}`).join(" ");
    add(missing.length === 0, `${label}${browserNames.length > 1 ? ` (${name})` : ""}`, `It allows ${origins.join(", ") || "nothing"}. Run: npx -y secret-menu setup${suggested ? ` ${suggested}` : ""}`);
  }
  const sock = await socketReachable(socketPath);
  add(sock.ok, `Bridge reachable at ${socketPath}${sock.ok ? "" : ` (${sock.why})`}`, "Open Chrome with the Secret Menu extension enabled; Chrome starts the bridge. If it still fails, check chrome://extensions for errors.");
  return checks;
}

export function nextStepText() {
  return [
    "Connect your agent:",
    "  Add Secret Menu as an MCP server in your agent (Claude Desktop, Cursor, Codex, ...):",
    "    command: npx    args: [\"-y\", \"secret-menu\", \"mcp\"]",
    "  e.g. { \"mcpServers\": { \"secret-menu\": { \"command\": \"npx\", \"args\": [\"-y\", \"secret-menu\", \"mcp\"] } } }",
    "  Then reload Chrome's Secret Menu extension (or restart Chrome) and run: npx -y secret-menu doctor",
  ].join("\n");
}

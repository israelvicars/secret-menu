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
export const EXTENSION_ID_RE = /^[a-p]{32}$/;
export const MIN_NODE_MAJOR = 22;
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// What the stable copy needs to run host/native-host.mjs without the npx cache (host imports ../lib/*).
const APP_PARTS = ["host", "lib", "bin", "package.json", join("ext", "EXTENSION_ID")];

// Where Chrome (stable, default user data dir) looks for per-user native messaging host manifests.
export function chromeHostsDir({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  if (platform === "linux") return join(env.XDG_CONFIG_HOME || join(home, ".config"), "google-chrome", "NativeMessagingHosts");
  if (platform === "win32") throw new Error("secret-menu setup does not support Windows yet (Chrome there needs a registry key, and the bridge needs a named pipe). macOS and Linux are supported.");
  throw new Error(`secret-menu setup does not support ${platform} yet. macOS and Linux are supported.`);
}

export function resolveExtensionId({ flag, env = process.env } = {}) {
  const [id, source] = flag ? [flag, "--extension-id"] : env.SECRET_MENU_EXTENSION_ID ? [env.SECRET_MENU_EXTENSION_ID, "SECRET_MENU_EXTENSION_ID"] : [DEFAULT_EXTENSION_ID, "default (the extension's pinned ID)"];
  const trimmed = String(id).trim();
  if (!EXTENSION_ID_RE.test(trimmed)) throw new Error(`Not a Chrome extension ID (${source}): ${JSON.stringify(trimmed)}. IDs are 32 letters a-p, shown on chrome://extensions with Developer mode on.`);
  return { id: trimmed, source };
}

export function setupPaths({ dataHome, platform, home, env } = {}) {
  const dir = join(dataHome, "native-host", "setup");
  return { dir, app: join(dir, "app"), launcher: join(dir, "secret-menu-host"), receipt: join(dir, "setup.json"), hostsDir: chromeHostsDir({ platform, home, env }), get manifest() { return join(this.hostsDir, `${HOST_NAME}.json`); } };
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

export function manifestFor({ launcher, extensionId }) {
  return { name: HOST_NAME, description: "Secret Menu local bridge", path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] };
}

export function setup({ dataHome, extensionId, platform = process.platform, home = homedir(), env = process.env, nodePath = process.execPath, pkgRoot = PKG_ROOT } = {}) {
  const p = setupPaths({ dataHome, platform, home, env });
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
  const existing = readJson(p.manifest);
  const replaced = existing && existing.path && existing.path !== p.launcher ? existing.path : null;
  const manifestText = `${JSON.stringify(manifestFor({ launcher: p.launcher, extensionId }), null, 2)}\n`;
  actions.push([writeIfChanged(p.manifest, manifestText), p.manifest]);
  // 4. A receipt, so uninstall removes only what setup wrote.
  const receipt = { manifest: p.manifest, launcher: p.launcher, app: p.app, extensionId, node: nodePath };
  actions.push([writeIfChanged(p.receipt, `${JSON.stringify(receipt, null, 2)}\n`), p.receipt]);
  return { ...p, manifest: p.manifest, actions, replaced, extensionId };
}

export function uninstall({ dataHome, platform = process.platform, home = homedir(), env = process.env } = {}) {
  const p = setupPaths({ dataHome, platform, home, env });
  const receipt = readJson(p.receipt);
  const manifestPath = receipt?.manifest ?? p.manifest;
  const actions = [];
  const m = readJson(manifestPath);
  if (m && m.path === p.launcher) { rmSync(manifestPath, { force: true }); actions.push(["removed", manifestPath]); }
  else if (m) actions.push(["kept", `${manifestPath} (points at ${m.path}, not written by setup)`]);
  else actions.push(["absent", manifestPath]);
  if (existsSync(p.dir)) { rmSync(p.dir, { recursive: true, force: true }); actions.push(["removed", p.dir]); }
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
export async function doctor({ dataHome, socketPath, extensionId, platform = process.platform, home = homedir(), env = process.env, nodeVersion = process.versions.node } = {}) {
  const checks = [];
  const add = (ok, label, fix) => checks.push({ ok, label, ...(ok ? {} : { fix }) });
  const major = Number(String(nodeVersion).split(".")[0]);
  add(major >= MIN_NODE_MAJOR, `Node ${nodeVersion} (needs ${MIN_NODE_MAJOR}+)`, `Install Node ${MIN_NODE_MAJOR} or newer (https://nodejs.org).`);
  let p;
  try { p = setupPaths({ dataHome, platform, home, env }); }
  catch (e) { add(false, "Platform supported", e.message); return checks; }
  const setupFix = "Run: npx -y secret-menu setup";
  const manifest = readJson(p.manifest);
  if (!existsSync(p.manifest)) { add(false, `Native host manifest at ${p.manifest}`, setupFix); return checks; }
  if (!manifest) { add(false, `Native host manifest parses (${p.manifest})`, `The file is not valid JSON. ${setupFix}`); return checks; }
  add(true, `Native host manifest at ${p.manifest}`);
  add(manifest.name === HOST_NAME, `Manifest name is ${HOST_NAME}`, setupFix);
  let exec = false;
  try { exec = statSync(manifest.path).isFile(); accessSync(manifest.path, constants.X_OK); } catch { exec = false; }
  add(exec, `Manifest points at an executable (${manifest.path})`, setupFix);
  if (exec && manifest.path === p.launcher) {
    const text = readText(p.launcher) ?? "";
    const quoted = [...text.matchAll(/^exec '((?:[^']|'\\'')*)' '((?:[^']|'\\'')*)'/gm)][0];
    const unq = (s) => s.replace(/'\\''/g, "'");
    const node = quoted && unq(quoted[1]), script = quoted && unq(quoted[2]);
    add(!!node && existsSync(node), `Launcher's Node exists (${node ?? "unknown"})`, `Node moved or was removed (nvm upgrade?). ${setupFix}`);
    add(!!script && existsSync(script), `Launcher's host script exists (${script ?? "unknown"})`, setupFix);
  }
  const origins = Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins : [];
  const want = `chrome-extension://${extensionId}/`;
  add(origins.includes(want), `Manifest allows extension ${extensionId}`, `It allows ${origins.join(", ") || "nothing"}. Run: npx -y secret-menu setup --extension-id ${extensionId}`);
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

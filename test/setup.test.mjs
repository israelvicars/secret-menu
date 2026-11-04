import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_EXTENSION_ID, EXTENSION_ID_RE, HOST_NAME, KNOWN_EXTENSION_IDS, STORE_EXTENSION_ID, browserDataDir, chromeHostsDir, doctor, resolveBrowsers, resolveExtensionIds, setup, uninstall } from "../lib/setup.mjs";

const cwd = new URL("..", import.meta.url);
const DUMMY = "abcdefghijklmnopabcdefghijklmnop";
const realChrome = join(homedir(), "Library", "Application Support", "Google", "Chrome");
// Every test gets its own HOME and SECRET_MENU_HOME; nothing may land in the real Chrome dir or ~/.secret-menu.
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "sm-setup-"));
  const home = join(root, "home"), data = join(root, "data");
  mkdirSync(home); mkdirSync(data);
  return { root, home, data, done: () => rmSync(root, { recursive: true, force: true }) };
}
const cli = (args, sb, extra = {}) => {
  const env = { ...process.env, HOME: sb.home, SECRET_MENU_HOME: sb.data, XDG_CONFIG_HOME: join(sb.home, ".config"), ...extra };
  if (!("SECRET_MENU_EXTENSION_ID" in extra)) delete env.SECRET_MENU_EXTENSION_ID;
  return spawnSync(process.execPath, ["bin/secret-menu", ...args], { cwd, env, encoding: "utf8" });
};
const hostsDir = (sb) => chromeHostsDir({ home: sb.home, env: { XDG_CONFIG_HOME: join(sb.home, ".config") } });

test("Chrome hosts dir per platform; Windows and others get a clear error", () => {
  assert.equal(chromeHostsDir({ platform: "darwin", home: "/h" }), "/h/Library/Application Support/Google/Chrome/NativeMessagingHosts");
  assert.equal(chromeHostsDir({ platform: "linux", home: "/h", env: {} }), "/h/.config/google-chrome/NativeMessagingHosts");
  assert.equal(chromeHostsDir({ platform: "linux", home: "/h", env: { XDG_CONFIG_HOME: "/x" } }), "/x/google-chrome/NativeMessagingHosts");
  assert.throws(() => chromeHostsDir({ platform: "win32", home: "/h" }), /does not support Windows yet/);
  assert.throws(() => chromeHostsDir({ platform: "freebsd", home: "/h" }), /does not support freebsd/);
});

test("browser names map to the documented macOS and Linux folders", () => {
  const expected = {
    chrome: ["Google/Chrome", "google-chrome"],
    "chrome-beta": ["Google/Chrome Beta", "google-chrome-beta"],
    "chrome-dev": ["Google/Chrome Dev", "google-chrome-unstable"],
    "chrome-canary": ["Google/Chrome Canary", null],
    chromium: ["Chromium", "chromium"],
  };
  for (const [name, [mac, linux]] of Object.entries(expected)) {
    assert.equal(browserDataDir({ browser: name, platform: "darwin", home: "/h" }), `/h/Library/Application Support/${mac}`);
    if (linux) assert.equal(browserDataDir({ browser: name, platform: "linux", home: "/h", env: {} }), `/h/.config/${linux}`);
    else assert.throws(() => browserDataDir({ browser: name, platform: "linux", home: "/h", env: {} }), /not supported on Linux/);
  }
});

test("browser detection uses existing data folders, with Chrome fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "sm-detect-"));
  try {
    const env = { XDG_CONFIG_HOME: join(root, "config") };
    mkdirSync(browserDataDir({ browser: "chrome-beta", platform: "linux", home: root, env }), { recursive: true });
    mkdirSync(browserDataDir({ browser: "chromium", platform: "linux", home: root, env }), { recursive: true });
    assert.deepEqual(resolveBrowsers({ platform: "linux", home: root, env }), ["chrome-beta", "chromium"]);
    rmSync(env.XDG_CONFIG_HOME, { recursive: true, force: true });
    assert.deepEqual(resolveBrowsers({ platform: "linux", home: root, env }), ["chrome"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("browser selection rejects unknown names and Linux Canary", () => {
  assert.throws(() => resolveBrowsers({ browsers: ["vivaldi"], platform: "linux", home: "/h", env: {} }), /Unknown browser.*chrome-beta.*chromium/);
  assert.throws(() => resolveBrowsers({ browsers: ["chrome-canary"], platform: "linux", home: "/h", env: {} }), /chrome-canary.*not supported on Linux/);
});

test("setup writes selected browser manifests and reports each folder", () => {
  const sb = sandbox();
  try {
    const r = cli(["setup", "--browser", "chrome-beta,chromium", "--extension-id", DUMMY], sb);
    assert.equal(r.status, 0, r.stderr);
    for (const browser of ["chrome-beta", "chromium"]) {
      const dir = chromeHostsDir({ browser, home: sb.home, env: { XDG_CONFIG_HOME: join(sb.home, ".config") } });
      assert.ok(existsSync(join(dir, `${HOST_NAME}.json`)));
      assert.match(r.stdout, new RegExp(`browser\\s+${browser}: ${dir.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`));
    }
  } finally { sb.done(); }
});

test("uninstall removes our manifests from all supported folders but keeps foreign ones", () => {
  const sb = sandbox();
  try {
    assert.equal(cli(["setup", "--browser", "chrome,chrome-beta", "--extension-id", DUMMY], sb).status, 0);
    const beta = chromeHostsDir({ browser: "chrome-beta", home: sb.home, env: { XDG_CONFIG_HOME: join(sb.home, ".config") } });
    writeFileSync(join(beta, `${HOST_NAME}.json`), JSON.stringify({ name: HOST_NAME, path: "/foreign/host" }));
    const r = cli(["uninstall"], sb);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(hostsDir(sb), `${HOST_NAME}.json`)));
    assert.ok(existsSync(join(beta, `${HOST_NAME}.json`)));
    assert.match(r.stdout, /kept/);
  } finally { sb.done(); }
});

test("uninstall --browser keeps the launcher while another browser still uses it; a plain uninstall then cleans up", () => {
  const sb = sandbox();
  try {
    assert.equal(cli(["setup", "--browser", "chrome,chromium", "--extension-id", DUMMY], sb).status, 0);
    const env = { XDG_CONFIG_HOME: join(sb.home, ".config") };
    const chromium = join(chromeHostsDir({ browser: "chromium", home: sb.home, env }), `${HOST_NAME}.json`), chrome = join(hostsDir(sb), `${HOST_NAME}.json`);
    const launcher = JSON.parse(readFileSync(chrome, "utf8")).path;
    const r = cli(["uninstall", "--browser", "chromium"], sb);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(chromium));
    assert.ok(existsSync(chrome));
    assert.ok(existsSync(launcher), "launcher kept for Chrome");
    assert.match(r.stdout, /kept .*still used by/);
    const r2 = cli(["uninstall"], sb);
    assert.equal(r2.status, 0, r2.stderr);
    assert.ok(!existsSync(chrome));
    assert.ok(!existsSync(launcher));
  } finally { sb.done(); }
});

test("doctor reports a check for each selected browser", async () => {
  const sb = sandbox();
  try {
    setup({ dataHome: sb.data, extensionIds: [DUMMY], browsers: ["chrome", "chrome-beta"], platform: "darwin", home: sb.home, env: {} });
    const checks = await doctor({ dataHome: sb.data, socketPath: "/nonexistent", extensionIds: [DUMMY], browsers: ["chrome", "chrome-beta"], platform: "darwin", home: sb.home, env: {} });
    assert.ok(checks.some((check) => check.label.includes("chrome-beta") && check.label.includes("Native host manifest")));
    assert.ok(checks.some((check) => check.label.includes("chrome") && check.label.includes("Native host manifest")));
  } finally { sb.done(); }
});

test("extension IDs: flags, then env, then the known IDs; bad IDs are refused", () => {
  assert.deepEqual(resolveExtensionIds({ flags: [DUMMY], env: { SECRET_MENU_EXTENSION_ID: "b".repeat(32) } }).ids, [DUMMY, ...KNOWN_EXTENSION_IDS]);
  assert.deepEqual(resolveExtensionIds({ env: { SECRET_MENU_EXTENSION_ID: "b".repeat(32) } }).ids, ["b".repeat(32), ...KNOWN_EXTENSION_IDS]);
  assert.deepEqual(resolveExtensionIds({ env: {} }).ids, KNOWN_EXTENSION_IDS);
  assert.equal(DEFAULT_EXTENSION_ID, readFileSync(new URL("../ext/EXTENSION_ID", import.meta.url), "utf8").trim());
  assert.ok(STORE_EXTENSION_ID === null || EXTENSION_ID_RE.test(STORE_EXTENSION_ID));
  assert.throws(() => resolveExtensionIds({ flags: [DUMMY, "zzz"], env: {} }), /Not a Chrome extension ID/);
  assert.deepEqual(resolveExtensionIds({ env: { SECRET_MENU_EXTENSION_ID: ` ${"b".repeat(32)}, ${"c".repeat(32)} ` } }).ids, ["b".repeat(32), "c".repeat(32), ...KNOWN_EXTENSION_IDS]);
});

test("setup without an ID flag includes exactly the known IDs", () => {
  const sb = sandbox();
  try {
    assert.equal(cli(["setup"], sb).status, 0);
    const manifestPath = join(hostsDir(sb), `${HOST_NAME}.json`);
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")).allowed_origins, KNOWN_EXTENSION_IDS.map((id) => `chrome-extension://${id}/`));
  } finally { sb.done(); }
});

test("setup CLI writes launcher + manifest under the temp HOME, is idempotent, and prints the next step", () => {
  const sb = sandbox();
  try {
    const r = cli(["setup", "--extension-id", DUMMY], sb);
    assert.equal(r.status, 0, r.stderr);
    const manifestPath = join(hostsDir(sb), `${HOST_NAME}.json`);
    assert.ok(manifestPath.startsWith(sb.home));
    assert.ok(!r.stdout.includes(realChrome), "never mentions the real Chrome dir");
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(m.name, HOST_NAME);
    assert.deepEqual(m.allowed_origins, [DUMMY, ...KNOWN_EXTENSION_IDS].map((id) => `chrome-extension://${id}/`));
    assert.equal(m.path, join(sb.data, "native-host", "setup", "secret-menu-host"));
    assert.ok(statSync(m.path).mode & 0o100);
    const launcher = readFileSync(m.path, "utf8");
    assert.match(launcher, /^#!\/bin\/sh\n/);
    assert.ok(launcher.includes(`SECRET_MENU_HOME='${sb.data}'`));
    assert.ok(launcher.includes(join(sb.data, "native-host", "setup", "app", "host", "native-host.mjs")), "runs the stable copy, not the package dir");
    assert.ok(existsSync(join(sb.data, "native-host", "setup", "app", "lib", "core.mjs")));
    assert.match(r.stdout, /Connect your agent:/);
    assert.match(r.stdout, /secret-menu", "mcp"/);
    assert.match(r.stdout, new RegExp(`wrote\\s+${manifestPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const again = cli(["setup", "--extension-id", DUMMY], sb);
    assert.equal(again.status, 0, again.stderr);
    assert.doesNotMatch(again.stdout, /^\s+wrote/m);
    assert.match(again.stdout, /unchanged/);
    // Env var is used when no flag; changing the ID rewrites only the manifest (and receipt).
    const env = cli(["setup"], sb, { SECRET_MENU_EXTENSION_ID: "c".repeat(32) });
    assert.equal(env.status, 0, env.stderr);
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")).allowed_origins, ["c".repeat(32), ...KNOWN_EXTENSION_IDS].map((id) => `chrome-extension://${id}/`));
    assert.match(env.stdout, /SECRET_MENU_EXTENSION_ID/);
    assert.equal(cli(["setup", "--extension-id", "nope"], sb).status, 2);
    assert.equal(cli(["setup", "--extension-id", DUMMY, "--extension-id", "nope"], sb).status, 2);
  } finally { sb.done(); }
});

test("setup notes when it replaces a manifest that pointed elsewhere; uninstall keeps foreign manifests", () => {
  const sb = sandbox();
  try {
    const manifestPath = join(hostsDir(sb), `${HOST_NAME}.json`);
    mkdirSync(hostsDir(sb), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({ name: HOST_NAME, path: "/somewhere/else/host", allowed_origins: [] }));
    const r = cli(["setup", "--extension-id", DUMMY], sb);
    assert.match(r.stdout, /used to point at \/somewhere\/else\/host/);
    const u = cli(["uninstall"], sb);
    assert.equal(u.status, 0, u.stderr);
    assert.ok(!existsSync(manifestPath));
    assert.ok(!existsSync(join(sb.data, "native-host", "setup")));
    assert.ok(existsSync(sb.data), "data home itself is kept");
    // A manifest setup did not write survives uninstall.
    writeFileSync(manifestPath, JSON.stringify({ name: HOST_NAME, path: "/dev/checkout/host" }));
    const u2 = cli(["uninstall"], sb);
    assert.equal(u2.status, 0);
    assert.match(u2.stdout, /kept/);
    assert.ok(existsSync(manifestPath));
  } finally { sb.done(); }
});

test("uninstall leaves launch's own wrapper alone", () => {
  const sb = sandbox();
  try {
    const launchWrapper = join(sb.data, "native-host", "secret-menu-host");
    mkdirSync(join(sb.data, "native-host"), { recursive: true });
    writeFileSync(launchWrapper, "#!/bin/sh\n"); chmodSync(launchWrapper, 0o700);
    assert.equal(cli(["setup", "--extension-id", DUMMY], sb).status, 0);
    assert.equal(cli(["uninstall"], sb).status, 0);
    assert.ok(existsSync(launchWrapper));
  } finally { sb.done(); }
});

test("setup accepts repeated extension ID flags without duplicates", () => {
  const sb = sandbox();
  try {
    const second = "b".repeat(32);
    assert.equal(cli(["setup", "--extension-id", DUMMY, "--extension-id", second], sb).status, 0);
    const manifestPath = join(hostsDir(sb), `${HOST_NAME}.json`);
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")).allowed_origins, [DUMMY, second, ...KNOWN_EXTENSION_IDS].map((id) => `chrome-extension://${id}/`));
  } finally { sb.done(); }
});

test("doctor: fails before setup with a fix, passes after setup with a live bridge socket", async () => {
  const sb = sandbox();
  try {
    const before = cli(["doctor", "--extension-id", DUMMY], sb);
    assert.equal(before.status, 1);
    assert.match(before.stdout, /^ok   Node /m);
    assert.match(before.stdout, /^FAIL Native host manifest/m);
    assert.match(before.stdout, /fix: Run: npx -y secret-menu setup/);
    assert.equal(cli(["setup", "--extension-id", DUMMY], sb).status, 0);
    const noBridge = cli(["doctor", "--extension-id", DUMMY], sb);
    assert.equal(noBridge.status, 1);
    assert.match(noBridge.stdout, /^ok   Manifest points at an executable/m);
    assert.match(noBridge.stdout, /^ok   Launcher's Node exists/m);
    assert.match(noBridge.stdout, /^ok   Manifest allows extension/m);
    assert.match(noBridge.stdout, /^FAIL Bridge reachable .*no socket file/m);
    const wrongId = cli(["doctor", "--extension-id", "d".repeat(32)], sb);
    assert.match(wrongId.stdout, /^FAIL Manifest allows extensions d{32}/m);
    assert.match(wrongId.stdout, /setup --extension-id d{32}/);
    // Live socket: unit-level, short path (unix socket paths are length-limited).
    const sock = join(tmpdir(), `smd-${process.pid}.sock`);
    const server = createServer((s) => s.end()); await new Promise((r) => server.listen(sock, r));
    try {
      const checks = await doctor({ dataHome: sb.data, socketPath: sock, extensionIds: [DUMMY, ...KNOWN_EXTENSION_IDS], home: sb.home, env: { XDG_CONFIG_HOME: join(sb.home, ".config") } });
      assert.deepEqual(checks.filter((c) => !c.ok), []);
    } finally { await new Promise((r) => server.close(r)); rmSync(sock, { force: true }); }
    // Old Node is flagged.
    const old = await doctor({ dataHome: sb.data, socketPath: "/nonexistent", extensionIds: [DUMMY, ...KNOWN_EXTENSION_IDS], home: sb.home, env: {}, nodeVersion: "18.19.0" });
    assert.equal(old[0].ok, false);
  } finally { sb.done(); }
});

test("the unit API honours explicit home/dataHome (no real paths)", () => {
  const sb = sandbox();
  try {
    const res = setup({ dataHome: sb.data, extensionIds: [DUMMY, ...KNOWN_EXTENSION_IDS], home: sb.home, platform: "linux", env: {} });
    assert.ok(res.manifest.startsWith(join(sb.home, ".config", "google-chrome")));
    assert.deepEqual(uninstall({ dataHome: sb.data, home: sb.home, platform: "linux", env: {} }).actions.map((a) => a[0]), ["removed", "removed"]);
  } finally { sb.done(); }
});

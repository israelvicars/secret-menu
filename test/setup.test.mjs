import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_EXTENSION_ID, HOST_NAME, chromeHostsDir, doctor, resolveExtensionId, setup, uninstall } from "../lib/setup.mjs";

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

test("extension ID: flag, then env, then the default; bad IDs are refused", () => {
  assert.deepEqual(resolveExtensionId({ flag: DUMMY, env: { SECRET_MENU_EXTENSION_ID: "b".repeat(32) } }).id, DUMMY);
  assert.equal(resolveExtensionId({ env: { SECRET_MENU_EXTENSION_ID: "b".repeat(32) } }).id, "b".repeat(32));
  assert.equal(resolveExtensionId({ env: {} }).id, DEFAULT_EXTENSION_ID);
  assert.equal(DEFAULT_EXTENSION_ID, readFileSync(new URL("../ext/EXTENSION_ID", import.meta.url), "utf8").trim());
  assert.throws(() => resolveExtensionId({ flag: "zzz", env: {} }), /Not a Chrome extension ID/);
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
    assert.deepEqual(m.allowed_origins, [`chrome-extension://${DUMMY}/`]);
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
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")).allowed_origins, [`chrome-extension://${"c".repeat(32)}/`]);
    assert.match(env.stdout, /SECRET_MENU_EXTENSION_ID/);
    assert.equal(cli(["setup", "--extension-id", "nope"], sb).status, 2);
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
    assert.match(wrongId.stdout, /^FAIL Manifest allows extension d{32}/m);
    assert.match(wrongId.stdout, /setup --extension-id d{32}/);
    // Live socket: unit-level, short path (unix socket paths are length-limited).
    const sock = join(tmpdir(), `smd-${process.pid}.sock`);
    const server = createServer((s) => s.end()); await new Promise((r) => server.listen(sock, r));
    try {
      const checks = await doctor({ dataHome: sb.data, socketPath: sock, extensionId: DUMMY, home: sb.home, env: { XDG_CONFIG_HOME: join(sb.home, ".config") } });
      assert.deepEqual(checks.filter((c) => !c.ok), []);
    } finally { await new Promise((r) => server.close(r)); rmSync(sock, { force: true }); }
    // Old Node is flagged.
    const old = await doctor({ dataHome: sb.data, socketPath: "/nonexistent", extensionId: DUMMY, home: sb.home, env: {}, nodeVersion: "18.19.0" });
    assert.equal(old[0].ok, false);
  } finally { sb.done(); }
});

test("the unit API honours explicit home/dataHome (no real paths)", () => {
  const sb = sandbox();
  try {
    const res = setup({ dataHome: sb.data, extensionId: DUMMY, home: sb.home, platform: "linux", env: {} });
    assert.ok(res.manifest.startsWith(join(sb.home, ".config", "google-chrome")));
    assert.deepEqual(uninstall({ dataHome: sb.data, home: sb.home, platform: "linux", env: {} }).actions.map((a) => a[0]), ["removed", "removed"]);
  } finally { sb.done(); }
});

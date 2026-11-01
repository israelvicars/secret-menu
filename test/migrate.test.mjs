import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKER, legacyProfileLocked, migrateLegacyHome, resolveDataHome } from "../lib/migrate.mjs";
import { envWithFallback } from "../host/paths.mjs";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "secret-menu-migrate-"));
  const legacy = join(root, ".webmcp-tinker"), home = join(root, ".secret-menu");
  mkdirSync(join(legacy, "chrome-profile", "NativeMessagingHosts"), { recursive: true });
  mkdirSync(join(legacy, "index"), { recursive: true });
  mkdirSync(join(legacy, "run"), { recursive: true });
  writeFileSync(join(legacy, "sites.json"), '{"sites":{}}');
  writeFileSync(join(legacy, "index", "allbirds.json"), '{"schema":"tinker.index/v1"}');
  writeFileSync(join(legacy, "run", "chrome.pid"), "1\n");
  writeFileSync(join(legacy, "chrome-profile", "Prefs"), "x");
  writeFileSync(join(legacy, "chrome-profile", "NativeMessagingHosts", "com.webmcptinker.bridge.json"), '{"path":"/x/native-host/webmcp-tinker-host"}');
  return { root, legacy, home, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("data home: override, then migrated new dir, then the old dir until migration, else the new dir", () => {
  const t = setup();
  try {
    assert.equal(resolveDataHome({ override: "/o", home: t.home, legacy: t.legacy }), "/o");
    assert.equal(resolveDataHome({ home: t.home, legacy: t.legacy }), t.legacy);
    mkdirSync(t.home); assert.equal(resolveDataHome({ home: t.home, legacy: t.legacy }), t.legacy, "a stale ~/.secret-menu without the marker doesn't win");
    writeFileSync(join(t.home, MARKER), "{}"); assert.equal(resolveDataHome({ home: t.home, legacy: t.legacy }), t.home);
    assert.equal(resolveDataHome({ home: join(t.root, "nope"), legacy: join(t.root, "nope2") }), join(t.root, "nope"));
  } finally { t.done(); }
});

test("migration copies once, keeps the old dir intact, sets same-name entries aside and drops the unused old host manifest", () => {
  const t = setup();
  try {
    mkdirSync(join(t.home, "chrome-profile"), { recursive: true }); writeFileSync(join(t.home, "chrome-profile", "Prefs"), "stale");
    mkdirSync(join(t.home, "browsers")); writeFileSync(join(t.home, "browsers", "keep"), "1");
    const before = readdirSync(t.legacy).sort();
    const r = migrateLegacyHome({ legacy: t.legacy, home: t.home, inUse: () => false, now: Date.parse("2026-11-01T05:00:00Z") });
    assert.equal(r.status, "migrated");
    assert.deepEqual(r.copied.sort(), ["chrome-profile", "index", "sites.json"]);
    assert.equal(readFileSync(join(t.home, "chrome-profile", "Prefs"), "utf8"), "x");
    assert.equal(readFileSync(join(t.home, "chrome-profile.pre-migration-20261101-050000", "Prefs"), "utf8"), "stale");
    assert.ok(existsSync(join(t.home, "browsers", "keep")));
    assert.ok(!existsSync(join(t.home, "run")), "runtime state is not copied");
    assert.ok(!existsSync(join(t.home, "chrome-profile", "NativeMessagingHosts", "com.webmcptinker.bridge.json")));
    assert.ok(existsSync(join(t.legacy, "chrome-profile", "NativeMessagingHosts", "com.webmcptinker.bridge.json")), "old dir untouched");
    assert.deepEqual(readdirSync(t.legacy).sort(), before);
    assert.ok(existsSync(join(t.home, MARKER)));
    assert.equal(migrateLegacyHome({ legacy: t.legacy, home: t.home, inUse: () => false }).status, "done");
  } finally { t.done(); }
});

test("migration waits while Chrome uses the old profile, and skips with an override or no old dir", () => {
  const t = setup();
  try {
    symlinkSync("host-123", join(t.legacy, "chrome-profile", "SingletonLock"));
    assert.equal(legacyProfileLocked(t.legacy), true);
    const r = migrateLegacyHome({ legacy: t.legacy, home: t.home });
    assert.equal(r.status, "skipped"); assert.match(r.message, /still using/);
    assert.ok(!existsSync(t.home));
    assert.equal(migrateLegacyHome({ legacy: t.legacy, home: t.home, override: "/o" }).status, "override");
    assert.equal(migrateLegacyHome({ legacy: join(t.root, "none"), home: t.home }).status, "none");
  } finally { t.done(); }
});

test("renamed env vars win; the old names are the fallback", () => {
  assert.equal(envWithFallback("SECRET_MENU_HOME", "WEBMCP_TINKER_HOME", { SECRET_MENU_HOME: "/n", WEBMCP_TINKER_HOME: "/o" }), "/n");
  assert.equal(envWithFallback("SECRET_MENU_HOME", "WEBMCP_TINKER_HOME", { WEBMCP_TINKER_HOME: "/o" }), "/o");
  assert.equal(envWithFallback("SECRET_MENU_HOME", "WEBMCP_TINKER_HOME", {}), undefined);
});

test("legacyProfileLocked: a SingletonLock left by a dead Chrome on this host is stale; live, foreign or odd locks still block", async () => {
  const { legacyProfileLocked } = await import("../lib/migrate.mjs");
  const { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "secret-menu-lock-"));
  try {
    const profile = join(dir, "chrome-profile");
    mkdirSync(profile);
    const lock = join(profile, "SingletonLock");
    assert.equal(legacyProfileLocked(dir, { host: "mac.lan", alive: () => true }), false); // no lock
    symlinkSync("mac.lan-53719", lock);
    assert.equal(legacyProfileLocked(dir, { host: "mac.lan", alive: () => false }), false); // stale
    assert.equal(legacyProfileLocked(dir, { host: "mac.lan", alive: (pid) => pid === 53719 }), true); // live
    assert.equal(legacyProfileLocked(dir, { host: "other.lan", alive: () => false }), true); // another host
    rmSync(lock); symlinkSync("garbage", lock);
    assert.equal(legacyProfileLocked(dir, { host: "mac.lan", alive: () => false }), true);
    rmSync(lock); writeFileSync(lock, "x");
    assert.equal(legacyProfileLocked(dir, { host: "mac.lan", alive: () => false }), true); // not a symlink
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

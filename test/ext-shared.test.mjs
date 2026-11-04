// The popup runs lib/explain.mjs in the browser with a node:crypto shim and a shared theme module.
// Node 22.18+ strips TypeScript types, so these import the extension's .ts sources directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHash as shimHash } from "../ext/src/shims/node-crypto.ts";
import { resolveTheme, applyTheme, THEME_PREFS } from "../ext/src/lib/theme.ts";

test("node:crypto shim matches node's sha256 (same toolsDigest in popup and CLI)", () => {
  for (const parts of [[""], ["abc"], ["{\"name\":\"search\"}", "\0", "ünïcode ✓"]]) {
    const a = createHash("sha256"), b = shimHash("sha256");
    for (const p of parts) { a.update(p); b.update(p); }
    assert.equal(b.digest("hex"), a.digest("hex"));
  }
  assert.throws(() => shimHash("md5"), /only supports sha256/);
});

test("theme: system follows the OS, explicit choices win", () => {
  assert.deepEqual(THEME_PREFS, ["light", "dark", "system"]);
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("theme: applyTheme sets .dark, color-scheme and the stored preference on <html>", () => {
  const classes = new Set();
  const root = { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, style: {}, dataset: {} };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  try {
    assert.equal(applyTheme("system", root), "dark");
    assert.ok(classes.has("dark"));
    assert.equal(root.style.colorScheme, "dark");
    assert.equal(root.dataset.themePref, "system");
    assert.equal(applyTheme("light", root), "light");
    assert.ok(!classes.has("dark"));
  } finally { delete globalThis.window; }
});

test("theme status: reports the resolved theme, and says when it follows System", async () => {
  const { themeStatusLabel, THEME_STATUS_ID } = await import("../ext/src/lib/theme.ts");
  assert.equal(THEME_STATUS_ID, "sm-theme-status");
  assert.equal(themeStatusLabel("dark", "dark"), "Effective theme: dark");
  assert.equal(themeStatusLabel("light", "light"), "Effective theme: light");
  assert.equal(themeStatusLabel("system", "dark"), "Effective theme: dark (following System)");
  assert.equal(themeStatusLabel("system", "light"), "Effective theme: light (following System)");
});

test("popup test hooks: stable main id/name, state names, details ids", async () => {
  const h = await import("../ext/src/lib/test-hooks.ts");
  assert.equal(h.MAIN_ID, "sm-main");
  assert.equal(h.MAIN_STATE_ID, "sm-main-state");
  assert.equal(h.POPUP_MAIN_LABEL, "Secret Menu popup");
  assert.equal(h.PAGE_MAIN_LABEL, "Secret Menu abilities page");
  assert.equal(h.ABILITIES_PAGE_TITLE, "Secret Menu: Abilities");
  assert.equal(h.detailsId(0), "sm-details-0");
  assert.equal(h.detailsId(13), "sm-details-13");
  assert.equal(h.stateName({ kind: "loading" }), "loading");
  assert.equal(h.stateName({ kind: "ready" }), "ready");
  assert.equal(h.stateName({ kind: "error" }), "error");
  for (const r of ["not-web", "no-webmcp", "no-tools"]) assert.equal(h.stateName({ kind: "empty", reason: r }), `empty-${r}`);
});

test("theme button cycles Light -> Dark -> System and names the current and next theme (#24)", async () => {
  const { nextTheme, themeButtonLabel } = await import("../ext/src/lib/theme.ts");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "system");
  assert.equal(nextTheme("system"), "light");
  assert.equal(themeButtonLabel("dark"), "Theme: Dark. Switch to System");
  assert.equal(themeButtonLabel("system"), "Theme: System. Switch to Light");
  assert.equal(themeButtonLabel("light"), "Theme: Light. Switch to Dark");
});

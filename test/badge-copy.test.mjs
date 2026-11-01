import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeLabel, resolveBadgeTheme, shouldShowBadge } from "../ext/src/lib/badge-copy.ts";

test("badge shows only with tools and until dismissed", () => {
  assert.equal(shouldShowBadge(0, false), false);
  assert.equal(shouldShowBadge(12, false), true);
  assert.equal(shouldShowBadge(12, true), false);
  assert.equal(shouldShowBadge(NaN, false), false);
});
test("badge copy and theme follow the saved choice", () => {
  assert.equal(badgeLabel(1), "1 WebMCP tool"); assert.equal(badgeLabel(12), "12 WebMCP tools");
  assert.equal(resolveBadgeTheme("light", true), "light"); assert.equal(resolveBadgeTheme("dark", false), "dark");
  assert.equal(resolveBadgeTheme("system", true), "dark"); assert.equal(resolveBadgeTheme(undefined, false), "light");
});

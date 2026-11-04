import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest, EXTENSION_KEY, isStoreBuild } from "../ext/manifest.config.mjs";

test("manifest permissions and hosts are limited to required access", () => {
  const manifest = buildManifest();
  assert.deepEqual(manifest.permissions, ["nativeMessaging", "scripting", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
});

test("dev manifest has a key and store manifest does not", () => {
  assert.equal(buildManifest().key, EXTENSION_KEY);
  assert.equal(Object.hasOwn(buildManifest({ store: true }), "key"), false);
});

test("store build detection uses SECRET_MENU_STORE", () => {
  assert.equal(isStoreBuild({ SECRET_MENU_STORE: "1" }), true);
  assert.equal(isStoreBuild({}), false);
});

test("manifest has a valid name and Web Store description length", () => {
  const manifest = buildManifest();
  assert.equal(manifest.name, "Secret Menu for WebMCP");
  assert.ok(manifest.description.length <= 132);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extensionDigest } from "../lib/extension.mjs";

test("extension digest is stable and includes paths and contents", () => {
  const one = mkdtempSync(join(tmpdir(), "secret-menu-extension-one-"));
  const two = mkdtempSync(join(tmpdir(), "secret-menu-extension-two-"));
  try {
    mkdirSync(join(one, "nested"));
    mkdirSync(join(two, "nested"));
    writeFileSync(join(one, "b.js"), "b");
    writeFileSync(join(one, "nested", "a.js"), "a");
    writeFileSync(join(two, "nested", "a.js"), "a");
    writeFileSync(join(two, "b.js"), "b");
    assert.equal(extensionDigest(one), extensionDigest(two));
    writeFileSync(join(two, "b.js"), "changed");
    assert.notEqual(extensionDigest(one), extensionDigest(two));
  } finally {
    rmSync(one, { recursive: true, force: true });
    rmSync(two, { recursive: true, force: true });
  }
});

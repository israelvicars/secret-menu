import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeForeign, foreignTabs, forgetOpened, loadOpened, pruneOpened, recordOpened } from "../lib/opened-tabs.mjs";

test("records tabs Secret Menu opened and finds foreign ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "secret-menu-tabs-"));
  try {
    const path = join(dir, "opened-tabs.json");
    recordOpened(path, 11, { url: "https://www.allbirds.com/products/x?email=a@b.c", by: "mcp" });
    const opened = loadOpened(path);
    assert.equal(opened["11"].url, "https://www.allbirds.com"); // origin only
    const tabs = [{ tabId: 11, title: "Allbirds" }, { tabId: 12, title: "Google", url: "https://www.google.com/" }];
    assert.deepEqual(foreignTabs(tabs, opened).map((t) => t.tabId), [12]);
    assert.ok(!describeForeign(foreignTabs(tabs, opened)).includes("google.com"));
    forgetOpened(path, [11]);
    assert.deepEqual(loadOpened(path), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an unreadable file means nothing is ours (so stop refuses rather than closing)", () => {
  assert.deepEqual(foreignTabs([{ tabId: 1 }], {}).length, 1);
  assert.deepEqual(pruneOpened({ 1: {}, 2: {} }, [{ tabId: 2 }]), { 2: {} });
});

test("launch URLs: claims the new tab per URL (exact, then same origin), never a tab that existed before", async () => {
  const { matchLaunchTabs } = await import("../lib/opened-tabs.mjs");
  const tabs = [
    { tabId: 1, url: "http://127.0.0.1:8765/explain.html" }, // existed before launch
    { tabId: 5, url: "http://127.0.0.1:8765/explain.html" },
    { tabId: 6, url: "https://www.allbirds.com/collections/mens" }, // redirected from the launch URL
    { tabId: 7, url: "https://example.org/" },
  ];
  const got = matchLaunchTabs(tabs, ["http://127.0.0.1:8765/explain.html", "https://www.allbirds.com/"], [1]);
  assert.deepEqual(got.map((t) => t.tabId), [5, 6]);
  assert.deepEqual(matchLaunchTabs(tabs, ["not a url", "about:blank"], []), []);
  assert.deepEqual(matchLaunchTabs(tabs, [], []), []);
  // Two launches of the same URL claim two different tabs.
  const twice = matchLaunchTabs([{ tabId: 2, url: "https://a.test/" }, { tabId: 3, url: "https://a.test/" }], ["https://a.test/", "https://a.test/"]);
  assert.deepEqual(twice.map((t) => t.tabId), [2, 3]);
});

test("launch tabs recorded as 'launch' are not foreign, so stop no longer refuses on them", async () => {
  const { matchLaunchTabs } = await import("../lib/opened-tabs.mjs");
  const dir = mkdtempSync(join(tmpdir(), "secret-menu-launch-"));
  try {
    const path = join(dir, "opened-tabs.json");
    const tabs = [{ tabId: 9, title: "Fixture", url: "http://127.0.0.1:8765/explain.html" }];
    assert.equal(foreignTabs(tabs, loadOpened(path)).length, 1); // the old refusal
    for (const { tabId, url } of matchLaunchTabs(tabs, ["http://127.0.0.1:8765/explain.html"])) recordOpened(path, tabId, { url, by: "launch" });
    assert.equal(loadOpened(path)["9"].by, "launch");
    assert.deepEqual(foreignTabs(tabs, loadOpened(path)), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

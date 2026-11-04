import { test } from "node:test";
import assert from "node:assert/strict";
import { createPopupListener, POPUP_TARGET } from "../ext/src/bridge/popup-api.js";

const ext = { id: "jfeobmnppdjonobichecmfkabddogeim", url: "chrome-extension://jfeobmnppdjonobichecmfkabddogeim/popup.html" };
const call = (listener, msg, sender = ext) => new Promise((resolve) => {
  const ret = listener(msg, sender, resolve);
  if (ret === undefined) resolve("ignored");
});

test("popup listener answers list_page_tools through the shared handle()", async () => {
  const seen = [];
  const listener = createPopupListener(async (method, params) => { seen.push([method, params]); return { tools: [{ name: "search" }] }; }, { extensionId: ext.id });
  assert.deepEqual(await call(listener, { target: POPUP_TARGET, method: "list_page_tools", params: { tabId: 7 } }), { result: { tools: [{ name: "search" }] } });
  assert.deepEqual(seen, [["list_page_tools", { tabId: 7 }]]);
});

test("popup listener refuses anything that could act on a page", async () => {
  const listener = createPopupListener(async () => assert.fail("handle must not run"), { extensionId: ext.id });
  for (const method of ["call_page_tool", "open_tab", "close_tab", "reload_tab", "watch_start"]) {
    assert.match((await call(listener, { target: POPUP_TARGET, method })).error, /Not allowed/);
  }
});

test("popup listener ignores other targets, content scripts and other extensions", async () => {
  const listener = createPopupListener(async () => assert.fail("handle must not run"), { extensionId: ext.id });
  assert.equal(await call(listener, { target: "secret-menu-background", type: "doc_ready" }), "ignored");
  assert.equal(await call(listener, { target: POPUP_TARGET, method: "list_page_tools" }, { id: ext.id, url: "https://example.com/" }), "ignored");
  assert.equal(await call(listener, { target: POPUP_TARGET, method: "list_page_tools" }, { id: "other", url: "chrome-extension://other/x.html" }), "ignored");
});

test("popup listener reports handle() errors as text", async () => {
  const listener = createPopupListener(async () => { throw new Error("WebMCP is not available on this page"); }, { extensionId: ext.id });
  assert.deepEqual(await call(listener, { target: POPUP_TARGET, method: "list_page_tools", params: { tabId: 1 } }), { error: "WebMCP is not available on this page" });
});

test("popup listener passes WebMCP error metadata through when present", async () => {
  const listener = createPopupListener(async () => { const error = new Error("WebMCP is not available"); error.webmcp = { secureContext: false, modelContext: false }; throw error; }, { extensionId: ext.id });
  assert.deepEqual(await call(listener, { target: POPUP_TARGET, method: "list_page_tools" }), { error: "WebMCP is not available", webmcp: { secureContext: false, modelContext: false } });
});

test("popup listener leaves WebMCP metadata out when absent", async () => {
  const listener = createPopupListener(async () => { throw new Error("ordinary failure"); }, { extensionId: ext.id });
  assert.deepEqual(await call(listener, { target: POPUP_TARGET, method: "list_page_tools" }), { error: "ordinary failure" });
});

test("popup listener passes index_list through (local explain index, read-only)", async () => {
  const listener = createPopupListener(async (method) => ({ method, entries: [] }), { extensionId: ext.id });
  assert.deepEqual(await call(listener, { target: POPUP_TARGET, method: "index_list" }), { result: { method: "index_list", entries: [] } });
});

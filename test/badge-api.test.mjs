import { test } from "node:test";
import assert from "node:assert/strict";
import { abilitiesUrl, badgeText, BADGE_TARGET, createBadgeListener, openedStatus } from "../ext/src/bridge/badge-api.js";

const EXT = "jfeobmnppdjonobichecmfkabddogeim";
const sender = { id: EXT, tab: { id: 42, windowId: 3, index: 0 } };
const call = (l, msg, s = sender) => new Promise((resolve) => { if (l(msg, s, resolve) === undefined) resolve("ignored"); });
const getURL = (p) => `chrome-extension://${EXT}${p}`;

test("badgeText: empty for none, caps at 99+", () => {
  assert.equal(badgeText(0), ""); assert.equal(badgeText(undefined), ""); assert.equal(badgeText(12), "12"); assert.equal(badgeText(140), "99+");
});

test("badge sets the toolbar count only for its own tab", async () => {
  const seen = [];
  const l = createBadgeListener({ setBadge: (tabId, text) => seen.push([tabId, text]), getURL }, { extensionId: EXT });
  assert.deepEqual(await call(l, { target: BADGE_TARGET, method: "tools_seen", count: 12, tabId: 999 }), { ok: true });
  assert.deepEqual(seen, [[42, "12"]]);
});

test("open: popup when Chrome allows it, else the abilities page next to the tab", async () => {
  const tabs = [];
  const ok = createBadgeListener({ openPopup: async () => {}, openTab: (u) => tabs.push(u), getURL }, { extensionId: EXT });
  assert.deepEqual(await call(ok, { target: BADGE_TARGET, method: "open" }), { opened: "popup", focused: false });
  const no = createBadgeListener({ openPopup: async () => { throw new Error("no gesture"); }, openTab: (u) => tabs.push(u), getURL }, { extensionId: EXT });
  assert.deepEqual(await call(no, { target: BADGE_TARGET, method: "open" }), { opened: "tab", focused: false });
  assert.deepEqual(tabs, [abilitiesUrl(getURL, 42)]);
  assert.equal(tabs[0], `chrome-extension://${EXT}/popup.html?tab=42&view=page&from=badge`);
});

test("badge listener ignores other targets, tabless senders and other extensions; refuses unknown methods", async () => {
  const l = createBadgeListener({ setBadge: () => assert.fail(), openPopup: () => assert.fail(), getURL }, { extensionId: EXT });
  assert.equal(await call(l, { target: "secret-menu-ui", method: "list_page_tools" }), "ignored");
  assert.equal(await call(l, { target: BADGE_TARGET, method: "open" }, { id: EXT }), "ignored");
  assert.equal(await call(l, { target: BADGE_TARGET, method: "open" }, { id: "other", tab: { id: 1 } }), "ignored");
  assert.match((await call(l, { target: BADGE_TARGET, method: "call_page_tool" })).error, /Unknown badge method/);
});

test("open: focuses the tab's window before trying the popup, and records which surface opened", async () => {
  const order = [];
  const records = [];
  const l = createBadgeListener({
    focusWindow: async (w) => order.push(`focus:${w}`),
    openPopup: async (w) => order.push(`popup:${w}`),
    openTab: () => assert.fail("popup worked; no tab"),
    record: (r) => records.push(r),
    getURL,
  }, { extensionId: EXT });
  assert.deepEqual(await call(l, { target: BADGE_TARGET, method: "open" }), { opened: "popup", focused: true });
  assert.deepEqual(order, ["focus:3", "popup:3"]);
  assert.equal(records[0].opened, "popup"); assert.equal(records[0].focused, true); assert.equal(records[0].tabId, 42); assert.ok(records[0].at);
});

test("open: focus failing doesn't stop the fallback; a failed fallback reports opened none", async () => {
  const records = [];
  const fallback = createBadgeListener({ focusWindow: async () => { throw new Error("no window"); }, openPopup: async () => { throw new Error("not focused"); }, openTab: async () => {}, record: (r) => records.push(r), getURL }, { extensionId: EXT });
  assert.deepEqual(await call(fallback, { target: BADGE_TARGET, method: "open" }), { opened: "tab", focused: false });
  const broken = createBadgeListener({ openPopup: async () => { throw new Error("x"); }, openTab: async () => { throw new Error("tabs gone"); }, record: (r) => records.push(r), getURL }, { extensionId: EXT });
  const res = await call(broken, { target: BADGE_TARGET, method: "open" });
  assert.equal(res.opened, "none"); assert.match(res.error, /tabs gone/);
  assert.deepEqual(records.map((r) => r.opened), ["tab", "none"]);
});

test("openedStatus: readable status for each outcome", () => {
  assert.equal(openedStatus("popup"), "Opened the Secret Menu popup");
  assert.equal(openedStatus("tab"), "Opened Secret Menu abilities in a new tab");
  assert.equal(openedStatus("none"), "Couldn't open Secret Menu");
});

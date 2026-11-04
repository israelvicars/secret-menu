import { applySnapshot } from "./watch-logic.js";

// Shown by extension pages when the native host is missing; matched by NO_BRIDGE_RE in lib/site-data.ts.
export const NO_BRIDGE = "Secret Menu isn't connected to this computer yet. Run npx secret-menu setup once, then reopen this page.";

// Bridge service worker, moved unchanged from extension/background.js. Wrapped in startBridge() so
// WXT can import this module at build time without running it; the body is not re-indented on purpose
// (keeps the move diff small). contentScriptFile: where the built content script lives.
export function startBridge({ contentScriptFile = "content.js" } = {}) {
const HOST = "com.secretmenu.bridge";
const STARTED_AT = new Date().toISOString();
let port = null;
let reconnectCount = 0;
let retryMs = 500;
let hostSeen = false; // set once this port gets a message or survives 2s: a real host, not "not installed"
let mostRecentWebTabId = null;
const watchedTabs = new Set();
let lastTools = new Map();
const armVersions = new Map();
const isWeb = (url) => /^https?:\/\//.test(url ?? "");

// Requests from extension pages to the native host (host answers host_response). index_list only.
const hostPending = new Map();
let nextHostId = 1;
function hostRequest(method, params = {}, timeoutMs = 5000) {
  if (!port) return Promise.reject(new Error(NO_BRIDGE));
  const id = nextHostId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { hostPending.delete(id); reject(new Error("The Secret Menu bridge did not answer in time.")); }, timeoutMs);
    hostPending.set(id, { resolve, reject, timer });
    post({ type: "host_request", id, method, params });
  });
}

function post(message) {
  try { port?.postMessage(message); } catch {}
}

function emit(event) {
  post({ type: "event", event: { ts: new Date().toISOString(), ...event } });
}

function connect() {
  const openedAt = Date.now();
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => { hostSeen = true; return onHostMessage(msg); });
  port.onDisconnect.addListener(() => {
    // Reading lastError keeps Chrome from logging "Unchecked runtime.lastError". A host that is simply not
    // installed (no `secret-menu setup` yet) is a normal state: retry quietly, no console noise.
    const why = chrome.runtime.lastError?.message;
    const wasLive = hostSeen || Date.now() - openedAt > 2000;
    hostSeen = false;
    for (const p of hostPending.values()) { clearTimeout(p.timer); p.reject(new Error(`${NO_BRIDGE} (The bridge disconnected.)`)); }
    hostPending.clear();
    if (wasLive) console.warn("[secret-menu] host disconnected", why);
    port = null;
    reconnectCount++;
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, wasLive ? 10000 : 30000);
  });
  retryMs = 500;
  post({
    type: "hello",
    extensionVersion: chrome.runtime.getManifest().version,
    connectedAt: new Date().toISOString(),
    reconnectCount,
    serviceWorkerStartedAt: STARTED_AT,
  });
}

async function resolveTab(tabId) {
  if (tabId != null) return { tab: await chrome.tabs.get(Number(tabId)), fallback: false };
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active && isWeb(active.url)) {
    mostRecentWebTabId = active.id;
    return { tab: active, fallback: false };
  }
  if (mostRecentWebTabId != null) {
    try {
      const recent = await chrome.tabs.get(mostRecentWebTabId);
      if (isWeb(recent.url)) return { tab: recent, fallback: true };
    } catch {}
  }
  const web = (await chrome.tabs.query({})).filter((candidate) => isWeb(candidate.url));
  if (!web.length) throw new Error("No open web tab");
  web.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return { tab: web[0], fallback: true };
}

const tabResult = (tab, fallback, value = {}) => ({
  tabId: tab.id,
  tab: { id: tab.id, url: value.url ?? tab.url },
  fallback,
  ...value,
});

async function toContent(tabId, payload) {
  const message = { target: "secret-menu-content", ...payload };
  try {
    return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [contentScriptFile] });
    return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function armWatch(tabId, via = "navigation") {
  if (!watchedTabs.has(tabId)) return null;
  const version = (armVersions.get(tabId) ?? 0) + 1;
  armVersions.set(tabId, version);
  const deadline = Date.now() + 3000;
  let value;
  do {
    if (!watchedTabs.has(tabId) || armVersions.get(tabId) !== version) return null;
    try { value = await toContent(tabId, { action: "WATCH_START" }); } catch (error) {
      value = { error: String(error?.message ?? error) };
    }
    if (!value?.error) break;
    await delay(150);
  } while (Date.now() < deadline);
  if (value?.error || !value) return value;

  const applied = applySnapshot(lastTools, tabId, value.tools ?? [], via);
  lastTools = applied.state;
  for (const event of applied.events) {
    emit({
      ...event,
      tabId,
      url: value.url,
      toolchangeEvents: value.toolchangeEvents ?? 0,
    });
  }
  return value;
}

async function waitForComplete(tabId, timeoutMs = 15000) {
  const existing = await chrome.tabs.get(tabId);
  if (existing.status === "complete") return existing;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Timed out waiting for tab to load after 15000 ms")), timeoutMs);
    const listener = (updatedId, change) => {
      if (updatedId === tabId && change.status === "complete") finish();
    };
    function finish(error) {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else chrome.tabs.get(tabId).then(resolve, reject);
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function performAndWait(tabId, action, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Timed out waiting for tab to load after 15000 ms")), timeoutMs);
    const listener = (updatedId, change) => {
      if (updatedId === tabId && change.status === "complete") finish();
    };
    function finish(error) {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else chrome.tabs.get(tabId).then(resolve, reject);
    }
    chrome.tabs.onUpdated.addListener(listener);
    Promise.resolve().then(action).catch(finish);
  });
}

async function handle(method, params) {
  if (method === "list_tabs") {
    return (await chrome.tabs.query({})).filter((tab) => isWeb(tab.url)).map((tab) => ({ tabId: tab.id, active: tab.active, title: tab.title, url: tab.url }));
  }
  if (method === "open_tab") {
    if (!params.url) throw new Error("url is required");
    let tab;
    let fallback = false;
    if (params.new) tab = await chrome.tabs.create({ url: params.url });
    else {
      const resolved = await resolveTab(params.tabId);
      fallback = resolved.fallback;
      tab = await chrome.tabs.update(resolved.tab.id, { url: params.url });
    }
    tab = await waitForComplete(tab.id);
    return tabResult(tab, fallback, { url: tab.url });
  }
  if (method === "reload_tab") {
    const { tab, fallback } = await resolveTab(params.tabId);
    const loaded = await performAndWait(tab.id, () => chrome.tabs.reload(tab.id));
    return tabResult(loaded, fallback, { url: loaded.url });
  }
  if (method === "close_tab") {
    const { tab, fallback } = await resolveTab(params.tabId);
    const result = tabResult(tab, fallback, { url: tab.url });
    await chrome.tabs.remove(tab.id);
    return result;
  }

  const { tab, fallback } = await resolveTab(params.tabId);
  if (method === "list_page_tools") {
    const value = await toContent(tab.id, { action: "LIST_TOOLS" });
    if (value.error) throw new Error(value.error);
    lastTools = new Map(lastTools).set(tab.id, value.tools ?? []);
    return tabResult(tab, fallback, value);
  }
  if (method === "call_page_tool") {
    if (!params.name) throw new Error("name is required");
    const value = await toContent(tab.id, { action: "EXECUTE_TOOL", name: params.name, args: params.arguments ?? {} });
    if (value.error) throw new Error(value.error);
    return tabResult(tab, fallback, value);
  }
  if (method === "watch_start") {
    watchedTabs.add(tab.id);
    const value = await armWatch(tab.id, "start");
    if (value?.error) throw new Error(value.error);
    return tabResult(tab, fallback, value);
  }
  throw new Error(`Unknown method ${method}`);
}

async function onHostMessage(msg) {
  if (msg?.type === "host_response") {
    const p = hostPending.get(msg.id); if (!p) return;
    hostPending.delete(msg.id); clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
    return;
  }
  if (msg?.type !== "request") return;
  try { post({ type: "response", id: msg.id, result: await handle(msg.method, msg.params ?? {}) }); }
  catch (error) { post({ type: "response", id: msg.id, error: String(error?.message ?? error) }); }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.target !== "secret-menu-background") return;
  const tabId = sender.tab?.id;
  if (msg.type === "doc_ready" && watchedTabs.has(tabId)) {
    armWatch(tabId, "document-ready");
    return;
  }
  if (msg.type === "snapshot" && watchedTabs.has(tabId)) {
    const applied = applySnapshot(lastTools, tabId, msg.tools ?? [], msg.via);
    lastTools = applied.state;
    for (const event of applied.events) {
      emit({
        ...event,
        tabId,
        url: msg.url,
        toolchangeEvents: msg.toolchangeEvents ?? 0,
      });
    }
    return;
  }
  if (msg.type !== "event") return;
  emit({ ...msg.event, tabId });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { if (isWeb((await chrome.tabs.get(tabId)).url)) mostRecentWebTabId = tabId; } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "complete" || !isWeb(tab.url)) return;
  emit({ kind: "nav", tabId, url: tab.url, via: "navigation" });
  if (watchedTabs.has(tabId)) armWatch(tabId, "navigation");
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (!watchedTabs.has(removedTabId)) return;
  watchedTabs.delete(removedTabId);
  watchedTabs.add(addedTabId);
  const nextTools = new Map(lastTools);
  nextTools.set(addedTabId, nextTools.get(removedTabId) ?? []);
  nextTools.delete(removedTabId);
  lastTools = nextTools;
  armVersions.delete(removedTabId);
  emit({ kind: "replaced", tabId: addedTabId, oldTabId: removedTabId, newTabId: addedTabId, via: "navigation" });
  armWatch(addedTabId, "navigation");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  watchedTabs.delete(tabId);
  const nextTools = new Map(lastTools);
  nextTools.delete(tabId);
  lastTools = nextTools;
  armVersions.delete(tabId);
});

connect();
return { handle, hostRequest }; // for popup-api.js (read-only methods only)
}

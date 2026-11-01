// Messages from the in-page arrival badge (content script) to the service worker. The badge can only
// report how many tools its own tab has (toolbar count) and ask to show the abilities for its own
// tab. It never names another tab, and nothing here reads or calls a page tool.
export const BADGE_TARGET = "secret-menu-badge";

export function badgeText(count) {
  const n = Number(count) || 0;
  return n <= 0 ? "" : n > 99 ? "99+" : String(n);
}

export function abilitiesUrl(getURL, tabId) {
  return getURL(`/popup.html?tab=${encodeURIComponent(tabId)}&view=page&from=badge`);
}

// Where the last badge click went, so tests (and people) can tell which surface opened. Stored in
// chrome.storage.session under this key and echoed back to the badge, which shows it as a status.
export const LAST_OPEN_KEY = "secretMenu.lastBadgeOpen";
export function openedStatus(opened) {
  return opened === "popup" ? "Opened the Secret Menu popup" : opened === "tab" ? "Opened Secret Menu abilities in a new tab" : "Couldn't open Secret Menu";
}

// actions: { setBadge(tabId, text), openPopup(windowId) -> Promise, openTab(url, sender.tab) -> Promise, getURL(path),
//            focusWindow?(windowId) -> Promise, record?(result) }
// open: focus the tab's window first (Chrome refuses openPopup for an unfocused window), then try the
// popup, then fall back to the abilities page in a new tab. The reply says which: { opened, focused }.
export function createBadgeListener(actions, { extensionId } = {}) {
  return (msg, sender, reply) => {
    if (msg?.target !== BADGE_TARGET) return undefined;
    const tab = sender?.tab;
    if (!tab?.id || (extensionId && sender.id !== extensionId)) return undefined;
    if (msg.method === "tools_seen") {
      Promise.resolve(actions.setBadge(tab.id, badgeText(msg.count))).then(() => reply({ ok: true }), (e) => reply({ error: String(e?.message ?? e) }));
      return true;
    }
    if (msg.method === "open") {
      let focused = false;
      const done = (result) => {
        try { actions.record?.({ ...result, focused, tabId: tab.id, at: new Date().toISOString() }); } catch {}
        reply({ ...result, focused });
      };
      Promise.resolve()
        .then(() => actions.focusWindow ? Promise.resolve(actions.focusWindow(tab.windowId)).then(() => { focused = true; }, () => {}) : undefined)
        .then(() => actions.openPopup(tab.windowId))
        .then(() => done({ opened: "popup" }))
        .catch(() => Promise.resolve(actions.openTab(abilitiesUrl(actions.getURL, tab.id), tab)).then(() => done({ opened: "tab" })))
        .catch((e) => done({ opened: "none", error: String(e?.message ?? e) }));
      return true;
    }
    reply({ error: `Unknown badge method ${msg.method}` });
    return false;
  };
}

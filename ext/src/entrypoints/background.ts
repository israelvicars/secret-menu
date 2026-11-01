import { startBridge } from "@/bridge/background.js";
import { createPopupListener } from "@/bridge/popup-api.js";
import { createBadgeListener, LAST_OPEN_KEY } from "@/bridge/badge-api.js";

export default defineBackground({
  type: "module",
  main() {
    // WXT emits the content script here; background.js re-injects it from this path when a tab
    // predates the extension (same fallback as before, new location).
    const bridge = startBridge({ contentScriptFile: "content-scripts/content.js" });
    // Extension pages: a tab's tools (same handle() as the CLI) and the local explain index (from the host).
    const pageHandle = (method: string, params: Record<string, unknown>) =>
      method === "index_list" ? bridge.hostRequest("index_list") : bridge.handle(method, params);
    chrome.runtime.onMessage.addListener(createPopupListener(pageHandle, { extensionId: chrome.runtime.id }));
    // In-page badge: toolbar count for its tab, and "show me" (popup if Chrome allows, else the abilities page).
    chrome.runtime.onMessage.addListener(createBadgeListener({
      setBadge: async (tabId: number, text: string) => {
        await chrome.action.setBadgeText({ tabId, text });
        if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2f8f5b" });
      },
      focusWindow: (windowId?: number) => (windowId ? chrome.windows.update(windowId, { focused: true }) : Promise.resolve()),
      openPopup: (windowId?: number) => chrome.action.openPopup(windowId ? { windowId } : undefined),
      openTab: (url: string, from: chrome.tabs.Tab) => chrome.tabs.create({ url, windowId: from.windowId, index: from.index + 1, openerTabId: from.id }),
      getURL: (path: string) => chrome.runtime.getURL(path as any),
      record: (result: Record<string, unknown>) => { void chrome.storage.session.set({ [LAST_OPEN_KEY]: result }).catch(() => {}); },
    }, { extensionId: chrome.runtime.id }));
  },
});

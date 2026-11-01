// Opening the other extension pages from the popup (a new tab next to the page being explained).
export async function openExtensionPage(path: string, from?: chrome.tabs.Tab) {
  const url = chrome.runtime.getURL(path as any);
  await chrome.tabs.create(from?.windowId ? { url, windowId: from.windowId, index: (from.index ?? 0) + 1 } : { url });
}
export const isWeb = (url?: string) => /^https?:\/\//.test(url ?? "");
export const hostOf = (url?: string) => { try { return new URL(url ?? "").host; } catch { return ""; } };
export const bare = (host: string) => host.replace(/^www\./, "");

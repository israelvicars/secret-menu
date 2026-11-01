// Which tabs did secret-menu open? Stop and close only touch these unless forced,
// so a person's own tabs in the test Chrome are never closed by surprise.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadOpened(path) {
  if (!existsSync(path)) return {};
  try { const data = JSON.parse(readFileSync(path, "utf8")); return data && typeof data.tabs === "object" ? data.tabs : {}; }
  catch { return {}; }
}
function saveOpened(path, tabs) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ tabs }, null, 2) + "\n");
  renameSync(tmp, path);
}
export function recordOpened(path, tabId, { url, by }) {
  if (!Number.isInteger(tabId)) return;
  const tabs = loadOpened(path);
  tabs[String(tabId)] = { url: originOnly(url), by, openedAt: new Date().toISOString() };
  saveOpened(path, tabs);
}
export function forgetOpened(path, ids) {
  const tabs = loadOpened(path);
  for (const id of ids) delete tabs[String(id)];
  saveOpened(path, tabs);
}
export function isOpenedBySecretMenu(opened, tabId) { return Object.hasOwn(opened, String(tabId)); }
// Tabs that Secret Menu did not open (list_tabs already drops non-web pages such as the new-tab page).
export function foreignTabs(tabs, opened) { return (tabs ?? []).filter((t) => !isOpenedBySecretMenu(opened, t.tabId)); }
// Forget ids that are no longer open, so a reused tab id can never be mistaken for ours.
export function pruneOpened(opened, tabs) {
  const live = new Set((tabs ?? []).map((t) => String(t.tabId)));
  return Object.fromEntries(Object.entries(opened).filter(([id]) => live.has(id)));
}
export function describeForeign(tabs) {
  // Titles only, never URLs (URLs can carry personal data).
  return tabs.map((t) => `  - ${String(t.title ?? "(untitled)").slice(0, 80)}`).join("\n");
}
// Tabs Chrome opened for the URLs given to `secret-menu launch <url...>`: one new tab per URL, matched by
// exact URL first, then by origin (redirects, trailing slashes). Tabs that existed before are never claimed.
export function matchLaunchTabs(tabs, urls, beforeIds = []) {
  const before = new Set([...beforeIds].map(String));
  const fresh = (tabs ?? []).filter((t) => Number.isInteger(t.tabId) && !before.has(String(t.tabId)));
  const taken = new Set();
  const out = [];
  for (const url of urls ?? []) {
    const href = normalizeHref(url);
    const origin = originOnly(href ?? url);
    if (!origin || origin === "null") continue;
    const pick = fresh.find((t) => !taken.has(t.tabId) && normalizeHref(t.url) === href)
      ?? fresh.find((t) => !taken.has(t.tabId) && originOnly(t.url) === origin);
    if (pick) { taken.add(pick.tabId); out.push({ tabId: pick.tabId, url: pick.url }); }
  }
  return out;
}
function normalizeHref(url) { try { return new URL(url).href; } catch { return null; } }
function originOnly(url) { try { return new URL(url).origin; } catch { return null; } }

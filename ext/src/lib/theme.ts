// Shared theme for every extension page (popup now; abilities, hand-off and discovery pages later).
// chrome.storage.local holds the choice; localStorage mirrors it so theme-init can apply it
// synchronously before first paint (chrome.storage is async, which would flash the wrong theme).
export type ThemePref = "light" | "dark" | "system";
export const THEME_PREFS: ThemePref[] = ["light", "dark", "system"];
export const THEME_KEY = "secretMenu.theme";

const isPref = (v: unknown): v is ThemePref => typeof v === "string" && (THEME_PREFS as string[]).includes(v);
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

// What accessibility tools (agent-desktop, screen readers) read as the theme actually in use,
// after "system" is resolved. The pressed toggle only says what was chosen, not what it resolved to.
export const THEME_STATUS_ID = "sm-theme-status";
export function themeStatusLabel(pref: ThemePref, resolved: "light" | "dark"): string {
  return `Effective theme: ${resolved}${pref === "system" ? " (following System)" : ""}`;
}
// The theme button cycles Light -> Dark -> System (UX spec v1 #24).
const THEME_NAMES: Record<ThemePref, string> = { light: "Light", dark: "Dark", system: "System" };
export function nextTheme(pref: ThemePref): ThemePref {
  return THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length] ?? "light";
}
export function themeButtonLabel(pref: ThemePref): string {
  return `Theme: ${THEME_NAMES[pref]}. Switch to ${THEME_NAMES[nextTheme(pref)]}`;
}
export function effectiveTheme(pref: ThemePref): "light" | "dark" {
  return resolveTheme(pref, media().matches);
}

export function applyTheme(pref: ThemePref, root: HTMLElement = document.documentElement) {
  const resolved = resolveTheme(pref, media().matches);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.dataset.themePref = pref;
  return resolved;
}

export function cachedPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isPref(v) ? v : "system";
  } catch {
    return "system";
  }
}

export async function loadPref(): Promise<ThemePref> {
  const stored = (await chrome.storage.local.get(THEME_KEY))[THEME_KEY];
  const pref = isPref(stored) ? stored : "system";
  try { localStorage.setItem(THEME_KEY, pref); } catch {}
  return pref;
}

export async function savePref(pref: ThemePref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch {}
  applyTheme(pref);
  await chrome.storage.local.set({ [THEME_KEY]: pref });
}

// Keep a page in sync when the choice changes in another page, or the OS flips while on "system".
export function watchTheme(onPref: (pref: ThemePref) => void) {
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !(THEME_KEY in changes)) return;
    const next = changes[THEME_KEY].newValue;
    const pref = isPref(next) ? next : "system";
    try { localStorage.setItem(THEME_KEY, pref); } catch {}
    applyTheme(pref);
    onPref(pref);
  };
  const onMedia = () => { if (cachedPref() === "system") applyTheme("system"); };
  chrome.storage.onChanged.addListener(onStorage);
  media().addEventListener("change", onMedia);
  return () => {
    chrome.storage.onChanged.removeListener(onStorage);
    media().removeEventListener("change", onMedia);
  };
}

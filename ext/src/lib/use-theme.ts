import { useEffect, useState } from "react";
import { applyTheme, cachedPref, effectiveTheme, loadPref, savePref, watchTheme, type ThemePref } from "./theme";

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(cachedPref);
  const [effective, setEffective] = useState<"light" | "dark">(() => effectiveTheme(cachedPref()));
  useEffect(() => {
    let live = true;
    const sync = (p: ThemePref) => { setPref(p); setEffective(effectiveTheme(p)); };
    loadPref().then((p) => { if (live) { applyTheme(p); sync(p); } });
    const stop = watchTheme(sync);
    // The OS can flip while on "system": keep the reported effective theme in step.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => setEffective(effectiveTheme(cachedPref()));
    media.addEventListener("change", onMedia);
    return () => { live = false; stop(); media.removeEventListener("change", onMedia); };
  }, []);
  return { pref, effective, setPref: (p: ThemePref) => { setPref(p); setEffective(effectiveTheme(p)); void savePref(p); } };
}

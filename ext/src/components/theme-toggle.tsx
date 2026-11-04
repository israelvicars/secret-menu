import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/use-theme";
import { nextTheme, THEME_STATUS_ID, themeButtonLabel, themeStatusLabel, type ThemePref } from "@/lib/theme";

const ICONS: Record<ThemePref, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

// One button that cycles Light -> Dark -> System. The icon shows the current choice; the name and tooltip say
// what it is now and what a click switches to (UX spec v1 #24).
export function ThemeToggle() {
  const { pref, effective, setPref } = useTheme();
  const status = themeStatusLabel(pref, effective);
  const label = themeButtonLabel(pref);
  const Icon = ICONS[pref] ?? Monitor;
  return (
    <>
      {/* Test hook: the resolved theme, readable in the accessibility tree (sr-only, so not shown). */}
      <span id={THEME_STATUS_ID} role="status" aria-label={status} data-theme-effective={effective} data-theme-pref={pref} className="sr-only">{status}</span>
      <button type="button" onClick={() => setPref(nextTheme(pref))} aria-label={label} title={label} aria-describedby={THEME_STATUS_ID} data-testid="theme-toggle" data-theme-pref={pref} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </>
  );
}

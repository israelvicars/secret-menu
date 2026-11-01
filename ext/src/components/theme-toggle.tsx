import { Monitor, Moon, Sun } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/lib/use-theme";
import { THEME_STATUS_ID, themeStatusLabel, type ThemePref } from "@/lib/theme";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle() {
  const { pref, effective, setPref } = useTheme();
  const status = themeStatusLabel(pref, effective);
  return (
    <>
    {/* Test hook: the resolved theme, readable in the accessibility tree (sr-only, so not shown). */}
    <span id={THEME_STATUS_ID} role="status" aria-label={status} data-theme-effective={effective} data-theme-pref={pref} className="sr-only">{status}</span>
    <ToggleGroup
      aria-label="Theme"
      aria-describedby={THEME_STATUS_ID}
      size="sm"
      variant="outline"
      spacing={0}
      value={[pref]}
      onValueChange={(next: unknown[]) => { const v = next[0] as ThemePref | undefined; if (v) setPref(v); }}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label} title={label} className="h-6 min-w-6 px-1.5 text-[11px] text-muted-foreground aria-pressed:bg-foreground/10 aria-pressed:font-semibold aria-pressed:text-foreground data-[pressed]:bg-foreground/10 data-[pressed]:text-foreground">
          <Icon className="size-3" />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    </>
  );
}

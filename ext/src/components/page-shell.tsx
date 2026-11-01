import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";

// Frame for the full-page extension views (hand-off, discover): title bar with the theme toggle.
export function PageShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[980px] px-5 py-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Mark className="size-4" />Secret Menu</div>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        <ThemeToggle />
      </header>
      <main className="rounded-2xl border bg-card p-5 text-card-foreground">{children}</main>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span><span className="text-sm">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <input type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label}
        className="peer relative h-5 w-9 flex-none cursor-pointer appearance-none rounded-full bg-muted-foreground/40 transition-colors checked:bg-label-safe-foreground after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-all checked:after:left-[18px] focus-visible:outline-2 focus-visible:outline-ring" />
    </label>
  );
}

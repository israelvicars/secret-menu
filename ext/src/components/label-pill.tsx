import { cn } from "@/lib/utils";
import type { Label } from "@/lib/abilities";

const STYLE: Record<Label, string> = {
  safe: "bg-label-safe text-label-safe-foreground",
  "changes the view": "bg-label-view text-label-view-foreground",
  "needs sign-in": "bg-label-sign text-label-sign-foreground",
  "changes data": "bg-label-change text-label-change-foreground",
  "spends money": "bg-label-spend text-label-spend-foreground",
};

export function LabelPill({ label, children, className }: { label: Label; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[18px] items-center rounded-full px-1.5 text-[11px] font-medium leading-none whitespace-nowrap", STYLE[label], className)}>
      {children ?? label}
    </span>
  );
}

// "from site hint" | "guessed" | "mixed: 3 from site hint, 2 guessed". Compact = one word, full text on hover.
export const shortFrom = (from: string) => (from === "from site hint" ? "hint" : from === "guessed" ? "guessed" : from.startsWith("mixed") ? "mixed" : from);

export function LabelFrom({ from, compact = false }: { from: string; compact?: boolean }) {
  const hint = from === "from site hint";
  return (
    <span title={compact ? from : undefined} className={cn("text-[11px] whitespace-nowrap", hint ? "text-from-hint" : "text-from-guess italic", compact && "text-[10.5px]")}>
      {compact ? shortFrom(from) : from}
    </span>
  );
}

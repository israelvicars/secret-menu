import type { Label } from "@/lib/abilities";

type Counts = { safe?: number; view?: number; signIn?: number; changes?: number; spends?: number } | null | undefined;

const ROWS: [Label, keyof NonNullable<Counts>][] = [
  ["safe", "safe"],
  ["changes the view", "view"],
  ["needs sign-in", "signIn"],
  ["changes data", "changes"],
  ["spends money", "spends"],
];

export function countPills(counts: Counts): { label: Label; n: number; text: string }[] {
  return ROWS.flatMap(([label, key]) => {
    const n = counts?.[key] ?? 0;
    return n ? [{ label, n, text: `${n} · ${label}` }] : [];
  });
}

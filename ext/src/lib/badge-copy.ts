// Pure helpers for the in-page arrival badge (kept out of the content script so tests can import them).
import { countLabel } from "./plural.ts";

export function badgeLabel(count: number): string {
  return countLabel(count, "WebMCP tool");
}
// The badge shows only when the page has registered at least one tool of its own.
export function shouldShowBadge(count: number, dismissed: boolean): boolean {
  return !dismissed && Number.isFinite(count) && count > 0;
}
export function resolveBadgeTheme(stored: unknown, systemDark: boolean): "light" | "dark" {
  return stored === "light" || stored === "dark" ? stored : systemDark ? "dark" : "light";
}

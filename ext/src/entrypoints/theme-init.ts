// Loaded as a classic, blocking <script> in each page's <head>, so the theme is set before first paint.
import { applyTheme, cachedPref } from "@/lib/theme";

export default defineUnlistedScript(() => {
  applyTheme(cachedPref());
});

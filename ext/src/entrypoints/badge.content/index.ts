// In-page arrival badge: a small pill in the page corner when the page has WebMCP tools.
// Plain DOM + CSS in a WXT shadow root (no React/Tailwind on host pages, no style leakage either way).
// It only counts tools (getTools); it never calls one. Click = open the popup (or the abilities page).
import "./style.css";
import { BADGE_TARGET, openedStatus } from "@/bridge/badge-api.js";
import { badgeLabel, resolveBadgeTheme, shouldShowBadge } from "@/lib/badge-copy";
import { MARK_SVG } from "@/lib/mark";
import { THEME_KEY } from "@/lib/theme";

type ModelContext = EventTarget & { getTools(): Promise<{ window?: Window }[]> };

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  cssInjectionMode: "ui",
  async main(ctx) {
    const mc = (document as unknown as { modelContext?: ModelContext }).modelContext;
    if (!mc) return; // no WebMCP at all: no badge, nothing else
    let count = 0;
    let dismissed = false;
    let reported = -1;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let stored: unknown = (await chrome.storage.local.get(THEME_KEY).catch(() => ({})) as Record<string, unknown>)[THEME_KEY];

    const ui = await createShadowRootUi(ctx, {
      name: "secret-menu-badge",
      position: "inline",
      anchor: "html",
      append: "last",
      onMount(container) {
        const root = document.createElement("div");
        root.className = "sm-badge";
        root.hidden = true;
        root.setAttribute("role", "region");
        root.setAttribute("aria-label", "Secret Menu");
        root.innerHTML = `
          <button type="button" class="sm-open" aria-label="Secret Menu: see what this page's WebMCP tools let you do">
            <span class="sm-icon" aria-hidden="true">${MARK_SVG}</span>
            <span class="sm-text"><span class="sm-title">What more can I do here?</span><span class="sm-count"></span></span>
          </button>
          <button type="button" class="sm-close" aria-label="Dismiss Secret Menu badge" title="Dismiss">×</button>
          <span class="sm-status" role="status" aria-live="polite"></span>`;
        container.append(root);
        root.querySelector(".sm-open")!.addEventListener("click", () => {
          // Test hook: say which surface opened (data-opened="popup|tab|none" plus a status in the AX tree).
          chrome.runtime.sendMessage({ target: BADGE_TARGET, method: "open" })
            .then((res: { opened?: string; focused?: boolean } | undefined) => {
              const opened = res?.opened ?? "none";
              root.dataset.opened = opened;
              root.dataset.focused = String(!!res?.focused);
              root.querySelector(".sm-status")!.textContent = openedStatus(opened);
            })
            .catch(() => { root.dataset.opened = "none"; });
        });
        root.querySelector(".sm-close")!.addEventListener("click", () => { dismissed = true; render(); });
        return root;
      },
    });
    // Mounted lazily: pages without tools never get our element in their DOM.

    function render() {
      if (!ui.mounted && shouldShowBadge(count, dismissed)) ui.mount();
      const el = ui.mounted as HTMLElement | undefined;
      if (!el) return;
      el.dataset.theme = resolveBadgeTheme(stored, media.matches);
      el.querySelector(".sm-count")!.textContent = badgeLabel(count);
      el.hidden = !shouldShowBadge(count, dismissed);
    }

    async function check() {
      try { count = (await mc!.getTools()).filter((t) => !t.window || t.window === window).length; } catch { count = 0; }
      render();
      if (count !== reported) {
        reported = count;
        chrome.runtime.sendMessage({ target: BADGE_TARGET, method: "tools_seen", count }).catch(() => {});
      }
    }

    // Tools often register a moment after load: check now, a few times over ~4 s, and on change events.
    await check();
    for (const ms of [500, 1000, 2000, 4000]) ctx.setTimeout(check, ms);
    for (const name of ["toolchange", "toolschange", "toolschanged"]) mc.addEventListener?.(name, () => void check());
    media.addEventListener("change", render);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && THEME_KEY in changes) { stored = changes[THEME_KEY].newValue; render(); }
    });
  },
});

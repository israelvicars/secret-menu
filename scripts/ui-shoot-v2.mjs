// Secret Menu v2 live check over loopback CDP (Secret Menu Chrome started with --remote-debugging-port=9333
// on 127.0.0.1). Read-only on real sites: it only reads the DOM / accessibility tree and screenshots;
// it never calls a page tool and never clicks inside a real site (only inside our own shadow-root badge
// when --click is given, which opens our popup or abilities page).
//   node scripts/ui-shoot-v2.mjs popup <tabId|none> <name> <outDir> <themes...> [--expand N] [--ax]
//   node scripts/ui-shoot-v2.mjs ext <path?query> <name> <outDir> <WxH> <themes...> [--ax]
//   node scripts/ui-shoot-v2.mjs page <urlPrefix> <name> <outDir> <themes...> [--click]
import { writeFileSync } from "node:fs";
const EXT = "jfeobmnppdjonobichecmfkabddogeim";
const base = "http://127.0.0.1:9333";
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, /^\d+$/.test(v ?? "") ? 2 : 1); return /^\d+$/.test(v ?? "") ? Number(v) : true; };
const expand = flag("--expand"), wantAx = flag("--ax"), click = flag("--click");
const [mode, what, name, outDir, ...rest] = argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  return { ws, send, evaluate };
}
const newTarget = async (url) => (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const closeTarget = (t) => fetch(`${base}/json/close/${t.id}`);
const setTheme = (c, theme) => c.evaluate(`(async () => { await chrome.storage.local.set({ "secretMenu.theme": ${JSON.stringify(theme)} }); localStorage.setItem("secretMenu.theme", ${JSON.stringify(theme)}); })()`);
const shoot = async (c, file, w, h) => { const s = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }); writeFileSync(file, Buffer.from(s.result.data, "base64")); return file; };
const waitText = async (c, busy) => { let t = ""; for (let i = 0; i < 60; i++) { await sleep(250); t = (await c.evaluate(`document.body?.innerText ?? ""`)) ?? ""; if (t && !busy.test(t)) break; } await sleep(400); return t; };
// Names/roles a screen reader (and agent-desktop) sees: interactive and labeled nodes only.
async function axDump(c) {
  const { result } = await c.send("Accessibility.getFullAXTree");
  return (result?.nodes ?? []).filter((n) => !n.ignored && n.name?.value && /button|radio|checkbox|switch|listitem|status|region|radiogroup|group|searchbox|textbox|link|heading|navigation|RootWebArea/.test(n.role?.value ?? ""))
    .map((n) => { const p = Object.fromEntries((n.properties ?? []).map((x) => [x.name, x.value?.value])); return [n.role.value, n.name.value, ...["expanded", "pressed", "checked"].filter((k) => k in p).map((k) => `${k}=${p[k]}`)].join(" | "); });
}

const results = {};
if (mode === "popup" || mode === "ext") {
  const path = mode === "popup" ? `/popup.html${what === "none" ? "" : `?tab=${what}`}` : what;
  const [w, h] = mode === "ext" ? rest.shift().split("x").map(Number) : [380, 600];
  const t = await newTarget(`chrome-extension://${EXT}${path}`);
  const c = await connect(t.webSocketDebuggerUrl);
  await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: false });
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((_, o) => { if (document.body) { window.__atBody = { dark: document.documentElement.classList.contains("dark") }; o.disconnect(); } }).observe(document, { childList: true, subtree: true });` });
  for (const theme of rest) {
    await setTheme(c, theme);
    await c.send("Page.reload", { ignoreCache: true });
    let text = await waitText(c, /Reading (this page|the site|your local)/);
    if (expand != null) { await c.evaluate(`document.querySelectorAll('[data-testid=ability-row] > button')[${expand}]?.click()`); await sleep(300); text = await c.evaluate(`document.body.innerText`); }
    const ch = await c.evaluate(`Math.ceil(document.getElementById("root").getBoundingClientRect().height)`);
    const scroll = await c.evaluate(`(() => { const m = document.querySelector("main"); return m ? { scrollH: m.scrollHeight, clientH: m.clientHeight, scrolls: m.scrollHeight > m.clientHeight + 1 } : null })()`);
    const file = await shoot(c, `${outDir}/${mode === "popup" ? "popup-" : ""}${name}-${theme}.png`, w, mode === "popup" ? Math.max(ch, 120) : Math.max(ch, h));
    const info = await c.evaluate(`({ title: document.title, atBody: window.__atBody, htmlDark: document.documentElement.classList.contains("dark"), states: [...document.querySelectorAll("[data-state]")].map((e) => e.dataset.state), rows: document.querySelectorAll("[data-testid=ability-row]").length, favicon: !!document.querySelector("[data-testid=site-favicon]"), letter: !!document.querySelector("[data-testid=site-letter]") })`);
    results[theme] = { file, height: ch, scroll, ...info, text: String(text).slice(0, 700) };
    if (wantAx && theme === rest[0]) results.ax = await axDump(c);
  }
  c.ws.close(); await closeTarget(t);
} else if (mode === "page") {
  const list = await (await fetch(`${base}/json/list`)).json();
  const t = list.find((x) => x.type === "page" && x.url.startsWith(what));
  if (!t) throw new Error(`no page target starting with ${what}`);
  await fetch(`${base}/json/activate/${t.id}`);
  const ctl = await newTarget(`chrome-extension://${EXT}/popup.html`); // our own page, only to set the theme
  const cc = await connect(ctl.webSocketDebuggerUrl);
  await fetch(`${base}/json/activate/${t.id}`);
  const c = await connect(t.webSocketDebuggerUrl);
  const probe = `(() => { const host = document.querySelector("secret-menu-badge"); const el = host?.shadowRoot?.querySelector(".sm-badge"); const r = el?.getBoundingClientRect(); return { hostCount: document.querySelectorAll("secret-menu-badge").length, shadow: !!host?.shadowRoot, visible: !!el && !el.hidden, theme: el?.dataset.theme ?? null, text: el?.innerText ?? null, rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null, labels: el ? [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")) : [], pageBodyFont: getComputedStyle(document.body).fontFamily.slice(0, 60), sheetsInDocument: [...document.styleSheets].filter((s) => (s.href ?? "").includes("chrome-extension")).length }; })()`;
  for (const theme of rest) {
    await setTheme(cc, theme);
    await sleep(800);
    const info = await c.evaluate(probe);
    const vp = await c.evaluate(`({ w: innerWidth, h: innerHeight })`);
    const s = await c.send("Page.captureScreenshot", { format: "png" });
    const file = `${outDir}/badge-${name}-${theme}.png`;
    writeFileSync(file, Buffer.from(s.result.data, "base64"));
    let crop = null;
    if (info.rect) {
      const pad = 24, x = Math.max(0, info.rect.x - 220), y = Math.max(0, info.rect.y - 120);
      const cs = await c.send("Page.captureScreenshot", { format: "png", clip: { x, y, width: Math.min(vp.w - x, info.rect.w + 220 + pad), height: Math.min(vp.h - y, info.rect.h + 120 + pad), scale: 2 } });
      crop = `${outDir}/badge-${name}-${theme}-closeup.png`;
      writeFileSync(crop, Buffer.from(cs.result.data, "base64"));
    }
    results[theme] = { file, crop, viewport: vp, ...info };
  }
  if (click) {
    const before = (await (await fetch(`${base}/json/list`)).json()).filter((x) => x.url.includes(EXT)).map((x) => x.url);
    await c.evaluate(`document.querySelector("secret-menu-badge").shadowRoot.querySelector(".sm-open").click()`);
    await sleep(1500);
    const after = (await (await fetch(`${base}/json/list`)).json()).filter((x) => x.url.includes(EXT)).map((x) => `${x.type} ${x.url}`);
    results.click = { before, after };
  }
  c.ws.close(); cc.ws.close(); await closeTarget(ctl);
}
console.log(JSON.stringify(results, null, 1));

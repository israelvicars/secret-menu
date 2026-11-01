// ui-wxt live check (needs the Secret Menu Chrome started with --remote-debugging-port=9333 on 127.0.0.1). Usage: node scripts/ui-shoot.mjs <tabId|none> <name> <outDir> <light|dark|system...>
// open popup.html?tab=<id> as a tab over loopback CDP, set the theme, screenshot.
import { writeFileSync } from "node:fs";
const [,, tabId, name, outDir, ...themes] = process.argv;
const EXT = "jfeobmnppdjonobichecmfkabddogeim";
const base = "http://127.0.0.1:9333";
const url = `chrome-extension://${EXT}/popup.html${tabId === "none" ? "" : `?tab=${tabId}`}`;
const target = await (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 380, height: 600, deviceScaleFactor: 2, mobile: false });
// Records the theme at the moment <body> is inserted (before any paint of page content).
await send("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((_, o) => { if (document.body) { window.__atBody = { dark: document.documentElement.classList.contains("dark"), pref: document.documentElement.dataset.themePref ?? null }; o.disconnect(); } }).observe(document, { childList: true, subtree: true });` });
const results = {};
for (const theme of themes) {
  await evaluate(`(async () => { await chrome.storage.local.set({ "secretMenu.theme": ${JSON.stringify(theme)} }); localStorage.setItem("secretMenu.theme", ${JSON.stringify(theme)}); })()`);
  await send("Page.reload", { ignoreCache: true });
  let text = "";
  for (let i = 0; i < 60; i++) { await sleep(250); text = (await evaluate(`document.body?.innerText ?? ""`)) ?? ""; if (text && !/Reading this page/.test(text)) break; }
  await sleep(400);
  const h = await evaluate(`Math.ceil(document.getElementById("root").getBoundingClientRect().height)`);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 380, height: Math.max(h, 120), scale: 1 } });
  const file = `${outDir}/popup-${name}-${theme}.png`;
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  const state = await evaluate(`({ atBody: window.__atBody, htmlDark: document.documentElement.classList.contains("dark"), colorScheme: document.documentElement.style.colorScheme, bg: getComputedStyle(document.body).backgroundColor, stored: null })`);
  state.stored = await evaluate(`chrome.storage.local.get("secretMenu.theme").then((x) => x["secretMenu.theme"])`);
  results[theme] = { file, height: h, ...state, text: text.slice(0, 400) };
}
console.log(JSON.stringify({ url, target: target.id, results }, null, 1));
ws.close();
await fetch(`${base}/json/close/${target.id}`);

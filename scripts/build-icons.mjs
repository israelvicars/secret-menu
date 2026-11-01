#!/usr/bin/env node
// Rasterizes the 🗝️ mark (ext/src/lib/mark.ts, Twemoji CC-BY 4.0) into ext/public/icon/{16,32,48,128}.png.
// No image libraries: it renders the SVG in a Chrome you already have open with CDP, e.g. the test Chrome from
// `secret-menu launch` wrapped with --remote-debugging-port. Usage: node scripts/build-icons.mjs [cdpPort=9333]
// Opens one about:blank target, screenshots it with a transparent background, and closes that target.
import { mkdirSync, writeFileSync } from "node:fs";
import { MARK_SVG } from "../ext/src/lib/mark.ts";

const port = Number(process.argv[2] ?? 9333);
const base = `http://127.0.0.1:${port}`;
const outDir = new URL("../ext/public/icon/", import.meta.url);
const SIZES = [16, 32, 48, 128];

const target = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 128, height: 128, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const html = `<style>html,body{margin:0;background:transparent}svg{display:block;width:128px;height:128px}</style>${MARK_SVG}`;
  await send("Runtime.evaluate", { expression: `document.open();document.write(${JSON.stringify(html)});document.close();` });
  mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    // Render at 128 CSS px and scale the clip, so each size is rasterized from the vector, not downsampled from a bitmap.
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 128, height: 128, scale: size / 128 } });
    if (!r.result?.data) throw new Error(`screenshot ${size} failed: ${JSON.stringify(r.error)}`);
    writeFileSync(new URL(`${size}.png`, outDir), Buffer.from(r.result.data, "base64"));
    console.log(`ext/public/icon/${size}.png`);
  }
} finally {
  ws.close();
  await fetch(`${base}/json/close/${target.id}`).catch(() => {});
}

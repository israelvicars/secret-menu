import { createServer } from "node:net";
import { appendFileSync, chmodSync, mkdirSync, rmSync } from "node:fs";
import { AUDIT_PATH, DATA_HOME, HOST_LOG, RUN_DIR, SOCKET_PATH } from "./paths.mjs";
import { appendAudit } from "../lib/audit.mjs";
import { loadPolicy } from "../lib/policy.mjs";
import { POLICY_PATH } from "./paths.mjs";
// The audit log is opt-in (`secret-menu safety on`); an unreadable policy file keeps auditing on.
const auditOn = () => { try { return loadPolicy(POLICY_PATH).safety.audit === true; } catch { return true; } };
import { canonical, sha256, unwrapResult } from "../lib/core.mjs";
import { readIndex } from "../lib/learn.mjs";

mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 }); chmodSync(RUN_DIR, 0o700); mkdirSync(DATA_HOME, { recursive: true, mode: 0o700 });
const log = (...a) => { try { appendFileSync(HOST_LOG, `${new Date().toISOString()} ${a.join(" ")}\n`); } catch {} };
const sendNative = (msg) => { const body = Buffer.from(JSON.stringify(msg)); const head = Buffer.alloc(4); head.writeUInt32LE(body.length); process.stdout.write(Buffer.concat([head, body])); };
const pending = new Map(), subscribers = new Set(); let nextId = 1;
const hostStartedAt = new Date().toISOString();
let status = { extensionReady: false, extensionVersion: null, connectedAt: null, reconnectCount: 0, serviceWorkerStartedAt: null };

function audit(req, result, error, started) {
  if (!auditOn()) return;
  const p = req.params ?? {}, info = result ?? {};
  const url = info.url ?? p.url ?? null; let origin = p.origin ?? null; try { origin ||= url ? new URL(url).origin : null; } catch {}
  const args = p.arguments ?? p.args ?? null;
  appendAudit(AUDIT_PATH, { ts: new Date().toISOString(), caller: req.caller ?? "other", method: req.method, tabId: info.tabId ?? p.tabId ?? null, origin, url, tool: p.name ?? p.tool ?? null, argsDigest: args == null ? null : sha256(canonical(args)), argsPreview: args == null ? null : canonical(args).slice(0, 200), approval: req.approval ?? "n/a", outcome: error ? "error" : "ok", error: error ?? null, resultChars: result == null ? 0 : JSON.stringify(result).length, ms: Date.now() - started });
}

function onExtensionMessage(msg) {
  if (msg.type === "hello") { status = { extensionReady: true, extensionVersion: msg.extensionVersion, connectedAt: new Date().toISOString(), reconnectCount: msg.reconnectCount ?? 0, serviceWorkerStartedAt: msg.serviceWorkerStartedAt ?? null }; return; }
  // Extension pages (Discover, hand-off) asking the host for local data. Read-only: only the
  // methods listed here, and only the explain index the CLI already writes.
  if (msg.type === "host_request") {
    const answer = (body) => sendNative({ type: "host_response", id: msg.id, ...body });
    if (msg.method === "index_list") { try { answer({ result: { home: DATA_HOME, entries: readIndex(DATA_HOME) } }); } catch (e) { answer({ error: String(e?.message ?? e) }); } }
    else answer({ error: `Unknown host method ${msg.method}` });
    return;
  }
  if (msg.type === "event") { for (const s of subscribers) s.write(JSON.stringify({ type: "event", event: msg.event }) + "\n"); return; }
  if (msg.type !== "response") return;
  const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id);
  if (p.req.method === "call_page_tool" && msg.result && "result" in msg.result) {
    msg.result.result = unwrapResult(msg.result.result);
  }
  audit(p.req, msg.result, msg.error, p.started);
  p.socket.write(JSON.stringify({ id: p.clientId, ...(msg.error ? { error: msg.error } : { result: msg.result }) }) + "\n");
}

let nativeBuf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => { nativeBuf = Buffer.concat([nativeBuf, chunk]); while (nativeBuf.length >= 4) { const len = nativeBuf.readUInt32LE(0); if (nativeBuf.length < len + 4) break; try { onExtensionMessage(JSON.parse(nativeBuf.subarray(4, 4 + len))); } catch (e) { log("bad native message", e.message); } nativeBuf = nativeBuf.subarray(4 + len); } });

rmSync(SOCKET_PATH, { force: true });
const server = createServer((socket) => {
  let buf = ""; socket.setEncoding("utf8");
  socket.on("data", (chunk) => { buf += chunk; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let req; try { req = JSON.parse(line); } catch { continue; }
    const started = Date.now();
    if (req.method === "status") { const result = { socketUp: true, hostPid: process.pid, hostStartedAt, ...status }; audit(req, result, null, started); socket.write(JSON.stringify({ id: req.id, result }) + "\n"); continue; }
    if (req.method === "subscribe") { const result = { subscribed: true }; subscribers.add(socket); audit(req, result, null, started); socket.write(JSON.stringify({ id: req.id, result }) + "\n"); if (status.extensionReady) sendNative({ type: "request", id: nextId++, method: "watch_start", params: req.params ?? {} }); continue; }
    if (req.method === "audit_note") { audit(req, null, req.params?.error ?? "refused", started); socket.write(JSON.stringify({ id: req.id, result: { logged: true } }) + "\n"); continue; }
    if (!status.extensionReady) { const error = "Extension not connected"; audit(req, null, error, started); socket.write(JSON.stringify({ id: req.id, error }) + "\n"); continue; }
    const id = nextId++; pending.set(id, { socket, clientId: req.id, req, started }); sendNative({ type: "request", id, method: req.method, params: req.params ?? {} });
  } });
  socket.on("close", () => subscribers.delete(socket)); socket.on("error", () => subscribers.delete(socket));
});
server.listen(SOCKET_PATH, () => { chmodSync(SOCKET_PATH, 0o600); log("listening", SOCKET_PATH); });

function shutdown() { status.extensionReady = false; for (const p of pending.values()) { const error = "Extension disconnected during request"; audit(p.req, null, error, p.started); p.socket.write(JSON.stringify({ id: p.clientId, error }) + "\n"); } pending.clear(); try { server.close(); } catch {} rmSync(SOCKET_PATH, { force: true }); process.exit(0); }
process.stdin.on("end", shutdown); process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);

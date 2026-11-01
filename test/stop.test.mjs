import test from "node:test";
import assert from "node:assert/strict";
import { terminate, parseStopTimeout, DEFAULT_STOP_TIMEOUT_MS } from "../lib/stop.mjs";

function fake(liveAfterTerm) {
  let t = 0; const sent = []; const live = new Set(liveAfterTerm);
  return { sent, opts: { alive: async () => new Set(live), signal: (pid, sig) => { sent.push([pid, sig]); if (sig === "SIGKILL") live.delete(pid); }, sleep: async (ms) => { t += ms; }, now: () => t } };
}

test("stop exits cleanly when Chrome quits on SIGTERM", async () => {
  const f = fake([]);
  const r = await terminate([1, 2], f.opts);
  assert.deepEqual(r, { stopped: [1, 2], remaining: [], killed: [] });
  assert.ok(f.sent.every(([, s]) => s === "SIGTERM"));
});

test("stop never sends SIGKILL by default and reports survivors", async () => {
  const f = fake([2]);
  const r = await terminate([1, 2], { ...f.opts, timeoutMs: 500 });
  assert.deepEqual(r.remaining, [2]);
  assert.deepEqual(r.stopped, [1]);
  assert.ok(!f.sent.some(([, s]) => s === "SIGKILL"));
});

test("stop --kill escalates to SIGKILL after the timeout", async () => {
  const f = fake([2]);
  const r = await terminate([1, 2], { ...f.opts, timeoutMs: 500, kill: true });
  assert.deepEqual(r.killed, [2]);
  assert.deepEqual(r.remaining, []);
  assert.deepEqual(f.sent.at(-1), [2, "SIGKILL"]);
});

test("parseStopTimeout defaults and validates", () => {
  assert.equal(parseStopTimeout(undefined), DEFAULT_STOP_TIMEOUT_MS);
  assert.equal(parseStopTimeout("2.5"), 2500);
  assert.throws(() => parseStopTimeout("0"));
  assert.throws(() => parseStopTimeout("abc"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { superviseSubscription } from "../lib/reconnect.mjs";

const settled = () => ({ closed: Promise.resolve() });

test("reconnects after the host goes away, with backoff, and resubscribes", async () => {
  const states = [];
  const waits = [];
  const calls = [];
  let n = 0;
  let stop = false;
  const plan = [settled, "down", "down", () => { stop = true; return { closed: new Promise(() => {}) }; }];
  const run = superviseSubscription({
    connect: async (opts) => {
      calls.push(opts.reconnect);
      const step = plan[n++];
      if (step === "down") throw new Error("Secret Menu is not running (no bridge socket).");
      return step();
    },
    onState: (s) => states.push(s.state),
    sleep: async (ms) => { waits.push(ms); },
    isStopped: () => stop,
  });
  await Promise.race([run, new Promise((r) => setTimeout(r, 50))]);
  assert.deepEqual(states, ["connected", "disconnected", "retrying", "retrying", "reconnected"]);
  assert.deepEqual(waits, [250, 500]);
  assert.deepEqual(calls, [false, true, true, true]);
});

test("a failed first connect is reported, not retried", async () => {
  await assert.rejects(
    superviseSubscription({ connect: async () => { throw new Error("no bridge"); }, sleep: async () => {} }),
    /no bridge/,
  );
});

test("backoff is capped and resets after a successful reconnect", async () => {
  const waits = [];
  let n = 0;
  let stop = false;
  const plan = [settled, "down", "down", "down", "down", settled, "down", () => { stop = true; return settled(); }];
  await superviseSubscription({
    connect: async () => { const s = plan[n++]; if (s === "down") throw new Error("down"); return s(); },
    sleep: async (ms) => { waits.push(ms); },
    maxDelayMs: 1000,
    isStopped: () => stop,
  });
  assert.deepEqual(waits, [250, 500, 1000, 1000, 250]);
});

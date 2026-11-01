import test from "node:test";
import assert from "node:assert/strict";
import { waitForTools } from "../lib/wait.mjs";

const tool = (name, description = "tool") => ({ name, description, inputSchema: { type: "object" }, annotations: {} });

test("waitForTools waits for a stable non-empty list and named tool", async () => {
  let calls = 0;
  const result = await waitForTools(async () => calls++ < 2 ? [] : [tool("ready")], { name: "ready", settleMs: 15, timeoutMs: 300 });
  assert.deepEqual(result.tools, [tool("ready")]);
  assert.equal(result.timedOut, undefined);
  assert.ok(result.waitedMs >= 15);
});

test("waitForTools reports timeout with the last list", async () => {
  const result = await waitForTools(async () => [tool("other")], { name: "missing", settleMs: 5, timeoutMs: 20 });
  assert.equal(result.timedOut, true);
  assert.deepEqual(result.tools, [tool("other")]);
});

function fakeClock() { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; }

test("without a name, a tool that registers 3 s after load is still caught", async () => {
  const clock = fakeClock();
  const result = await waitForTools(async () => clock.now() < 3000 ? [tool("early")] : [tool("early"), tool("late_tool")], { ...clock });
  assert.deepEqual(result.tools.map((t) => t.name), ["early", "late_tool"]);
  assert.equal(result.timedOut, undefined);
  assert.equal(result.changes, 1);
  assert.ok(result.waitedMs >= 6500 && result.waitedMs < 7000, `waited ${result.waitedMs}`);
});

test("a list that never stops changing ends at the timeout", async () => {
  const clock = fakeClock();
  let n = 0;
  const result = await waitForTools(async () => [tool(`t${n++}`)], { ...clock, timeoutMs: 2000 });
  assert.equal(result.timedOut, true);
});

test("a named tool returns after the short settle, not the quiet window", async () => {
  const clock = fakeClock();
  const result = await waitForTools(async () => [tool("get_status")], { ...clock, name: "get_status" });
  assert.ok(result.waitedMs <= 400, `waited ${result.waitedMs}`);
});

import test from "node:test";
import assert from "node:assert/strict";
import { applySnapshot, diffToolLists } from "../ext/src/bridge/watch-logic.js";

test("tool list diff reports additions, changes, and removals", () => {
  const before = [
    { name: "kept", description: "old", inputSchema: {}, annotations: {} },
    { name: "gone", description: "gone", inputSchema: {}, annotations: {} },
  ];
  const after = [
    { name: "kept", description: "new", inputSchema: {}, annotations: {} },
    { name: "added", description: "added", inputSchema: {}, annotations: {} },
  ];
  assert.deepEqual(diffToolLists(before, after), [
    { kind: "changed", name: "kept" },
    { kind: "added", name: "added" },
    { kind: "removed", name: "gone" },
  ]);
});

const tool = (name, description = name) => ({
  name,
  description,
  inputSchema: {},
  annotations: {},
});

test("identical snapshots emit no events", () => {
  let state = new Map();
  ({ state } = applySnapshot(state, 1, [tool("a")], "toolchange"));
  const result = applySnapshot(state, 1, [tool("a")], "navigation");
  assert.deepEqual(result.events, []);
});

test("toolchange followed by navigation emits one addition", () => {
  let state = new Map([[1, [tool("a")]]]);
  const first = applySnapshot(state, 1, [tool("a"), tool("checkout")], "toolchange");
  state = first.state;
  const second = applySnapshot(state, 1, [tool("a"), tool("checkout")], "navigation");
  assert.deepEqual(first.events, [{ kind: "added", name: "checkout", via: "toolchange" }]);
  assert.deepEqual(second.events, []);
});

test("new-document partial and complete snapshots produce paired churn", () => {
  let state = new Map([[1, [tool("a"), tool("b"), tool("c")]]]);
  const partial = applySnapshot(state, 1, [tool("a")], "document-ready");
  state = partial.state;
  const complete = applySnapshot(state, 1, [tool("a"), tool("b"), tool("c")], "toolchange");
  assert.deepEqual(partial.events.map((event) => [event.kind, event.name]), [
    ["removed", "b"],
    ["removed", "c"],
  ]);
  assert.deepEqual(complete.events.map((event) => [event.kind, event.name]), [
    ["added", "b"],
    ["added", "c"],
  ]);
});

test("schema changes emit one changed event", () => {
  const state = new Map([[1, [tool("a", "old")]]]);
  const result = applySnapshot(state, 1, [tool("a", "new")], "poll");
  assert.deepEqual(result.events, [{ kind: "changed", name: "a", via: "poll" }]);
});

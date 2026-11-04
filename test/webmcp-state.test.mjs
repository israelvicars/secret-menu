import { test } from "node:test";
import assert from "node:assert/strict";
import { noToolsReason, openWebmcpFlag, WEBMCP_FLAG_URL } from "../ext/src/lib/webmcp-state.ts";

test("noToolsReason selects the most useful empty state", () => {
  assert.equal(noToolsReason({ secureContext: false, modelContext: true, tools: 2 }), "insecure");
  assert.equal(noToolsReason({ secureContext: true, modelContext: false }), "no-webmcp");
  assert.equal(noToolsReason({ secureContext: true, modelContext: true, tools: 0 }), "no-tools");
  assert.equal(noToolsReason({ secureContext: true, modelContext: true, tools: 1 }), null);
  assert.equal(noToolsReason({ url: "http://example.com" }), "insecure");
  assert.notEqual(noToolsReason({ url: "http://localhost:8765" }), "insecure");
  assert.notEqual(noToolsReason({ url: "http://127.0.0.1" }), "insecure");
});

test("openWebmcpFlag opens the flag URL", async () => {
  let props;
  assert.equal(await openWebmcpFlag(async (value) => { props = value; }), "opened");
  assert.deepEqual(props, { url: WEBMCP_FLAG_URL });
});

test("openWebmcpFlag converts rejection and synchronous throws to failed", async () => {
  assert.equal(await openWebmcpFlag(async () => { throw new Error("nope"); }), "failed");
  assert.equal(await openWebmcpFlag(() => { throw new Error("nope"); }), "failed");
});

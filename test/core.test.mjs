import test from "node:test";
import assert from "node:assert/strict";
import { coerceValue, renderForm, siteSchema, unwrapResult, validateArgs } from "../lib/core.mjs";

test("schema renders readable form", () => { const out = renderForm({ name: "buy", description: "Buy", annotations: { readOnlyHint: false, consequentialHint: true }, inputSchema: JSON.stringify({ type: "object", properties: { item: { type: "string", enum: ["tea", "coffee", "a-very-long-enum-token-that-must-not-be-cut"], description: "Drink" }, qty: { type: "integer", default: 1 } }, required: ["item"] }) }); assert.match(out, /buy \[mutating\?\] \[consequential\]/); assert.match(out, /item\s+string\s+yes.*Drink/); assert.match(out, /choices: tea \| coffee \| a-very-long-enum-token-that-must-not-be-cut/); });
test("coercion and validation", () => { assert.equal(coerceValue("12", { type: "integer" }), 12); assert.equal(coerceValue("yes", { type: "boolean" }), true); assert.deepEqual(coerceValue("a,b", { type: "array", items: { type: "string" } }), ["a", "b"]); assert.deepEqual(coerceValue('{"x":1}', { type: "object" }), { x: 1 }); assert.deepEqual(validateArgs({ item: "bad" }, { type: "object", properties: { item: { type: "string", enum: ["tea"] } }, required: ["qty"] }), ["missing required field: qty", "item: must be one of tea"]); });
test("unwrap nested JSON and MCP text", () => { assert.deepEqual(unwrapResult(JSON.stringify({ content: [{ type: "text", text: '{"ok":true}' }] })), { ok: true }); });
test("unwrap result with tab selection metadata", () => { assert.deepEqual(unwrapResult({ tabId: 3, tab: { id: 3, url: "https://example.test" }, fallback: false, url: "https://example.test", result: '{"ok":true}' }), { ok: true }); });
test("unwrap plain JSON strings", () => {
  assert.deepEqual(unwrapResult('{"item":"scone"}'), { item: "scone" });
  assert.equal(unwrapResult("plain text"), "plain text");
});
test("only unwrap a single MCP text part when it contains JSON", () => {
  const plain = { content: [{ type: "text", text: "plain text" }] };
  const multiple = { content: [{ type: "text", text: "1" }, { type: "text", text: "2" }] };
  assert.equal(unwrapResult(plain), plain);
  assert.equal(unwrapResult(multiple), multiple);
});

test("siteSchema keeps the site's full input schema, per-field descriptions included", () => {
  const schema = { type: "object", description: "Search the catalog", properties: { catalog: { type: "object", description: "Wrap search args here", properties: { query: { type: "string", description: "Next steps: what to search for" } } } }, required: ["catalog"] };
  assert.deepEqual(siteSchema(schema), schema);
  assert.deepEqual(siteSchema(JSON.stringify(schema)), schema);
  assert.equal(siteSchema(schema).properties.catalog.properties.query.description, "Next steps: what to search for");
  assert.equal(siteSchema(undefined), null);
  assert.equal(siteSchema("not json"), null);
});

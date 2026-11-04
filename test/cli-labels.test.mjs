import test from "node:test";
import assert from "node:assert/strict";
import { hintLine, renderForm } from "../lib/core.mjs";
import { explainTools } from "../lib/explain.mjs";
import { tools } from "./fixtures/explain-tools.js";

const plain = (tool) => ({ name: tool.name, title: tool.title ?? null, description: tool.description ?? "", inputSchema: tool.inputSchema ?? null, annotations: { readOnlyHint: tool.annotations?.readOnlyHint ?? null, consequentialHint: tool.annotations?.consequentialHint ?? null, untrustedContentHint: tool.annotations?.untrustedContentHint ?? null } });

test("CLI form headers use the popup label and retain raw hints", () => {
  const report = explainTools(tools.map(plain), { url: "http://127.0.0.1:8765/explain.html" });
  const labels = new Map(report.abilities.flatMap((ability) => ability.tools.map((tool) => [tool.name, tool])));
  for (const tool of tools) {
    const out = renderForm(plain(tool), { label: labels.get(tool.name) });
    assert.match(out, new RegExp(`^${tool.name}  ${labels.get(tool.name).label} \\(`));
    assert.doesNotMatch(out, /\[mutating\?\]/);
  }
});

test("hint line reports the page's raw annotations, including explicit not-read-only", () => {
  assert.equal(hintLine({ annotations: {} }), "hint: none");
  assert.equal(hintLine({}), "hint: none");
  assert.equal(hintLine({ annotations: { readOnlyHint: true, untrustedContentHint: true } }), "hint: read-only, untrusted output");
  assert.equal(hintLine({ annotations: { readOnlyHint: false, destructiveHint: true } }), "hint: not read-only, destructive");
});

// The explain fixture is the deterministic page for UI and agent-desktop integration tests
// (see TESTING.md). Its tool list is pinned in test/fixtures/explain-tools.js and the rows the
// popup must show are pinned in test/fixtures/explain-expected.json. Change both together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tools } from "./fixtures/explain-tools.js";
import { explainTools } from "../lib/explain.mjs";

// Same shape content.js's plainTool() hands the bridge (annotations it forwards, schema as-is).
export const plain = (t) => ({ name: t.name, title: t.title ?? null, description: t.description ?? "", inputSchema: t.inputSchema ?? null, annotations: { readOnlyHint: t.annotations?.readOnlyHint ?? null, consequentialHint: t.annotations?.consequentialHint ?? null, untrustedContentHint: t.annotations?.untrustedContentHint ?? null } });
export const rows = (report) => ({ counts: report.counts, abilities: report.abilities.map((a) => ({ title: a.title, label: a.label, labelFrom: a.labelFrom, toolNames: a.toolNames })) });

test("explain fixture produces exactly the pinned popup rows", () => {
  const expected = JSON.parse(readFileSync(new URL("./fixtures/explain-expected.json", import.meta.url), "utf8"));
  const report = explainTools(tools.map(plain), { url: expected.url, tabId: 1, title: expected.title });
  assert.deepEqual(rows(report), { counts: expected.counts, abilities: expected.abilities });
});

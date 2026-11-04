import { test } from "node:test";
import assert from "node:assert/strict";
import { countLabel } from "../ext/src/lib/plural.ts";

test("countLabel pluralizes all counts except one", () => {
  assert.equal(countLabel(0, "tool"), "0 tools");
  assert.equal(countLabel(1, "tool"), "1 tool");
  assert.equal(countLabel(2, "tool"), "2 tools");
});

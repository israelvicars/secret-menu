import { test } from "node:test";
import assert from "node:assert/strict";
import { countPills } from "../ext/src/lib/count-pills.ts";

test("countPills returns non-zero labels in row order", () => {
  assert.deepEqual(countPills({ safe: 6, view: 2, signIn: 1, changes: 4, spends: 1 }), [
    { label: "safe", n: 6, text: "6 · safe" },
    { label: "changes the view", n: 2, text: "2 · changes the view" },
    { label: "needs sign-in", n: 1, text: "1 · needs sign-in" },
    { label: "changes data", n: 4, text: "4 · changes data" },
    { label: "spends money", n: 1, text: "1 · spends money" },
  ]);
  assert.deepEqual(countPills({ safe: 0, spends: 1 }), [{ label: "spends money", n: 1, text: "1 · spends money" }]);
});

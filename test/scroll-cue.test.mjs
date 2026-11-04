import test from "node:test";
import assert from "node:assert/strict";
import { hasMoreBelow } from "../ext/src/lib/scroll-cue.ts";

test("hasMoreBelow leaves a one-pixel tolerance at the bottom", () => {
  assert.equal(hasMoreBelow(0, 100, 101), false);
  assert.equal(hasMoreBelow(0, 100, 102), true);
  assert.equal(hasMoreBelow(50, 100, 150), false);
});

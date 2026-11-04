import test from "node:test";
import assert from "node:assert/strict";
import { explainError } from "../ext/src/lib/error-copy.ts";

test("explainError maps common popup failures to a cause and next step", () => {
  assert.equal(explainError("showing error page: ERR_FAILED").cause, "This tab is showing an error page, so there are no tools to read. Reload the page, then Re-check.");
  assert.equal(explainError("Cannot access chrome://settings").cause, "Chrome doesn't let extensions read this page. Open a regular website tab, then Re-check.");
  assert.equal(explainError("No tab with id: 7").cause, "That tab is gone. Open the site again, then Re-check.");
  assert.equal(explainError("native host disconnected").cause, "The Secret Menu bridge isn't connected. Run npx secret-menu setup (or secret-menu launch for the test Chrome), then Re-check.");
  assert.equal(explainError("unexpected failure").cause, "Something went wrong while reading the tools. Re-check, or reload the page and try again.");
});

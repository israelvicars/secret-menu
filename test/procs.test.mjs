import test from "node:test";
import assert from "node:assert/strict";
import { findProfileBrowsers, parsePsOutput } from "../lib/procs.mjs";

test("finds only main browsers for the exact profile path", () => {
  const text = `
  101     1 /Applications/Chrome --user-data-dir=/tmp/secret-menu
  102   101 /Applications/Chrome --type=renderer --user-data-dir=/tmp/secret-menu
  103     1 /Applications/Chrome --user-data-dir=/tmp/other
  104     1 /Applications/Chrome --user-data-dir=/tmp/secret-menu-more
  105     1 /Applications/Chrome --foo --user-data-dir=/tmp/secret-menu --bar
`;
  assert.deepEqual(
    findProfileBrowsers(parsePsOutput(text), "/tmp/secret-menu").map((row) => row.pid),
    [101, 105],
  );
});

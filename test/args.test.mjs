import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../lib/args.mjs";

const options = {
  values: ["--tab", "--for", "--args", "--timeout", "--arg"],
  booleans: ["--new", "--yes", "--json", "--headless", "--wait-tools"],
  multi: ["--arg"],
};

test("boolean flags can precede or follow the URL", () => {
  assert.deepEqual(parseArgs(["--new", "URL"], options).positionals, ["URL"]);
  assert.equal(parseArgs(["URL", "--new"], options).booleans.new, true);
});

test("repeatable and equals-style values parse", () => {
  const parsed = parseArgs(
    ["t", "--arg", "a=1", "--arg", "b=2", "--yes", "--tab=5"],
    options,
  );
  assert.deepEqual(parsed.positionals, ["t"]);
  assert.deepEqual(parsed.multi.arg, ["a=1", "b=2"]);
  assert.equal(parsed.booleans.yes, true);
  assert.equal(parsed.values.tab, "5");
});

test("unknown flags are rejected", () => {
  assert.throws(() => parseArgs(["--wat"], options), /unknown flag: --wat/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, helpText } from "../lib/cli-help.mjs";

const cwd = new URL("..", import.meta.url);
const run = (args, env = {}) => spawnSync(process.execPath, ["bin/secret-menu", ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });

test("help table covers every CLI command and general help has the required sections", () => {
  const help = helpText("/tmp/secret-menu");
  assert.equal(COMMANDS.length, 27);
  for (const command of COMMANDS) assert.match(help, new RegExp(`\\b${command.name.replace("-", "\\-")}\\b`));
  assert.match(help, /^🗝️ Secret Menu connects you and your agent to WebMCP tools across sites\./);
  assert.match(help, /\nStart here:/);
  assert.match(help, /\nCommands:/);
});

test("stop --help is informational and never runs stop", () => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-cli-help-"));
  try {
    const r = run(["stop", "--help"], { HOME: home, SECRET_MENU_HOME: home });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /--kill/);
    assert.match(r.stdout, /SIGKILL/);
    assert.doesNotMatch(r.stdout, /Chrome is not running/);
    assert.equal(r.stderr, "");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

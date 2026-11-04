import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = new URL("..", import.meta.url);

test("safety status explains where site entries are checked", () => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-safety-"));
  try {
    const r = spawnSync(process.execPath, ["bin/secret-menu", "safety"], { cwd, env: { ...process.env, SECRET_MENU_HOME: home }, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /site entries: 0 \(checked by secret-menu call, MCP call_page_tool and explain --probe, even with safety off\)/);
    assert.doesNotMatch(r.stdout, new RegExp(["always", "enforced"].join(" ")));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

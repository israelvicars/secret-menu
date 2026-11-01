import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("MCP server exits after stdin closes", async () => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-mcp-"));
  try {
    const child = spawn(process.execPath, ["bin/secret-menu", "mcp"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, SECRET_MENU_HOME: home },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.end([
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      "",
    ].join("\n"));
    const code = await Promise.race([
      new Promise((resolve) => child.on("exit", resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("MCP server did not exit")), 3000)),
    ]);
    assert.equal(code, 0);
    const messages = stdout.trim().split("\n").map(JSON.parse);
    assert.equal(messages.find((message) => message.id === 1)?.result.serverInfo.name, "secret-menu");
    assert.ok(messages.find((message) => message.id === 2)?.result.tools.length);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

async function session(lines, extraArgs = [], env = {}) {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-mcp-"));
  try {
    const child = spawn(process.execPath, ["bin/secret-menu", "mcp", ...extraArgs], { cwd: new URL("..", import.meta.url), env: { ...process.env, SECRET_MENU_HOME: home, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (c) => { stdout += c; });
    child.stdin.end(lines.map((x) => JSON.stringify({ jsonrpc: "2.0", ...x })).join("\n") + "\n");
    await new Promise((resolve) => child.on("exit", resolve));
    return stdout.trim().split("\n").map(JSON.parse);
  } finally { rmSync(home, { recursive: true, force: true }); }
}

test("MCP lists the chaining tools with in/out descriptions", async () => {
  const msgs = await session([{ id: 1, method: "tools/list", params: {} }]);
  const tools = msgs[0].result.tools;
  for (const n of ["open_site", "call_page_tool", "list_recipes", "run_recipe", "find_sites"]) {
    const t = tools.find((x) => x.name === n); assert.ok(t, n); assert.match(t.description, /In: .*Out: /s, n);
  }
});

test("list_recipes and find_sites work with no browser", async () => {
  const msgs = await session([{ id: 1, method: "tools/call", params: { name: "list_recipes", arguments: {} } }, { id: 2, method: "tools/call", params: { name: "find_sites", arguments: { task: "shoes" } } }]);
  assert.equal(msgs.find((m) => m.id === 1).result.structuredContent.recipes[0].id, "compare-shopify");
  assert.deepEqual(msgs.find((m) => m.id === 2).result.structuredContent.sites, []);
});

test("read-only mode is announced in call_page_tool's description", async () => {
  const msgs = await session([{ id: 1, method: "tools/list", params: {} }], ["--allow-tools", "search_catalog,get_product"]);
  assert.match(msgs[0].result.tools.find((t) => t.name === "call_page_tool").description, /READ-ONLY mode.*search_catalog, get_product/);
});

test("call_page_tool claims read-only only when the server enforces it", async () => {
  const plain = (await session([{ id: 1, method: "tools/list", params: {} }]))[0].result.tools.find((t) => t.name === "call_page_tool");
  const ro = (await session([{ id: 1, method: "tools/list", params: {} }], ["--read-only"]))[0].result.tools.find((t) => t.name === "call_page_tool");
  assert.equal(plain.annotations.readOnlyHint, false); assert.equal(ro.annotations.readOnlyHint, true);
});

test("read-only mode reads SECRET_MENU_MCP_READ_ONLY", async () => {
  const mode = async (env) => (await session([{ id: 1, method: "tools/call", params: { name: "list_recipes", arguments: {} } }], [], env))[0].result.structuredContent.mode;
  assert.equal(await mode({}), "normal");
  assert.equal(await mode({ SECRET_MENU_MCP_READ_ONLY: "1" }), "read-only");
});

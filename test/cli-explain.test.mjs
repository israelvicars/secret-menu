import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = new URL("..", import.meta.url);

test("CLI explain writes the explained site to the local index", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-explain-")), socketPath = join(home, "run", "bridge.sock");
  mkdirSync(join(home, "run"), { recursive: true });
  const bridge = createServer((socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const request = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        const result = request.method === "open_tab"
          ? { tabId: 7, url: request.params.url, title: "Fixture" }
          : { tabId: 7, url: "https://fixture.example/", title: "Fixture", tools: [{ name: "search_fixture", description: "Search the fixture.", inputSchema: { type: "object", properties: {}, required: [] }, annotations: { readOnlyHint: true } }] };
        socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
      }
    });
  });
  try { await new Promise((resolve, reject) => { bridge.once("listening", resolve); bridge.once("error", reject); bridge.listen(socketPath); }); }
  catch (error) { rmSync(home, { recursive: true, force: true }); if (error.code === "EPERM") { t.skip("runner denies Unix sockets"); return; } throw error; }
  const child = spawn(process.execPath, ["bin/secret-menu", "explain", "https://fixture.example/", "--json"], { cwd, env: { ...process.env, HOME: home, SECRET_MENU_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const output = await new Promise((resolve, reject) => { let stdout = "", stderr = ""; const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`CLI explain timed out: ${stderr}`)); }, 5000); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (data) => { stdout += data; }); child.stderr.on("data", (data) => { stderr += data; }); child.on("exit", (code) => { clearTimeout(timer); if (code) reject(new Error(`CLI explain exited ${code}: ${stderr}`)); else resolve(stdout); }); });
    assert.ok(JSON.parse(output).indexKey);
    const index = join(home, "index", "fixture.example.json");
    assert.ok(existsSync(index));
    assert.equal(JSON.parse(readFileSync(index, "utf8")).indexKey, "https://fixture.example");
  } finally { if (!child.killed) child.kill("SIGKILL"); bridge.close(); rmSync(home, { recursive: true, force: true }); }
});

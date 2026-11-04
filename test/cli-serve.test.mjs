import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = new URL("..", import.meta.url);
const tempHome = () => mkdtempSync(join(tmpdir(), "secret-menu-serve-"));
const freePort = () => new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const waitForExit = (child, timeout = 5000) => new Promise((resolve, reject) => { const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("child timed out")); }, timeout); let stdout = "", stderr = ""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (data) => { stdout += data; }); child.stderr.on("data", (data) => { stderr += data; }); child.on("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); }); });
const startServer = (port, home) => spawn(process.execPath, ["bin/secret-menu", "serve", "--port", String(port)], { cwd, env: { ...process.env, HOME: home, SECRET_MENU_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });

test("serve reports a busy port without a stack trace", async (t) => {
  const home = tempHome();
  const holder = createServer();
  try {
    try { await new Promise((resolve, reject) => { holder.once("listening", resolve); holder.once("error", reject); holder.listen(0, "127.0.0.1"); }); }
    catch (error) { if (error.code === "EPERM") { t.skip("runner denies TCP sockets"); return; } throw error; }
    const child = startServer(holder.address().port, home);
    try {
      const result = await waitForExit(child);
      assert.equal(result.code, 1);
      assert.match(result.stderr, new RegExp(`Port ${holder.address().port} is already in use`));
      assert.match(result.stderr, /secret-menu serve --port <n>/);
      assert.doesNotMatch(result.stderr, /at /);
    } finally { if (!child.killed) child.kill("SIGKILL"); }
  } finally { holder.close(); rmSync(home, { recursive: true, force: true }); }
});

test("serve accepts a port override and serves the fixture root", async (t) => {
  let port;
  try { port = await freePort(); }
  catch (error) { if (error.code === "EPERM") { t.skip("runner denies TCP sockets"); return; } throw error; }
  const home = tempHome(), child = startServer(port, home);
  try {
    const banner = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("serve did not start")), 3000); child.stdout.once("data", (data) => { clearTimeout(timer); resolve(String(data)); }); child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`serve exited ${code}`)); }); });
    assert.equal(banner.trim(), `Serving http://127.0.0.1:${port}/`);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
  } finally { child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); rmSync(home, { recursive: true, force: true }); }
});

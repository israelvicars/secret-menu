import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = new URL("..", import.meta.url);
const run = (bin, args, env = {}) => spawnSync(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });

test("secret-menu --help prints usage and the data dir", () => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-cli-"));
  try {
    const r = run("bin/secret-menu", ["--help"], { SECRET_MENU_HOME: home });
    assert.equal(r.status, 0); assert.match(r.stdout, /^🗝️ Secret Menu connects you and your agent to WebMCP tools across sites\./); assert.match(r.stdout, /Start here:/); assert.ok(r.stdout.includes(home)); assert.equal(r.stderr, "");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("package names, bins and host name use Secret Menu; the extension id is unchanged", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.name, "secret-menu"); assert.equal(pkg.bin["secret-menu"], "bin/secret-menu");
  assert.equal(JSON.parse(readFileSync(new URL("../ext/package.json", import.meta.url), "utf8")).name, "secret-menu-extension");
  assert.equal(readFileSync(new URL("../ext/EXTENSION_ID", import.meta.url), "utf8").trim(), "jfeobmnppdjonobichecmfkabddogeim");
  assert.match(readFileSync(new URL("../ext/src/bridge/background.js", import.meta.url), "utf8"), /const HOST = "com\.secretmenu\.bridge";/);
  assert.match(execFileSync(process.execPath, ["-e", 'import("./host/paths.mjs").then((p) => console.log(p.HOST_NAME))'], { cwd, encoding: "utf8" }), /^com\.secretmenu\.bridge/);
});

test("the npm package includes every fixture served by secret-menu serve", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.files.includes("test/fixtures/"));
  const cache = mkdtempSync(join(tmpdir(), "secret-menu-npm-cache-"));
  let packed;
  try { packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd, encoding: "utf8", env: { ...process.env, npm_config_cache: cache } })); }
  finally { rmSync(cache, { recursive: true, force: true }); }
  const files = new Set(packed[0].files.map((file) => file.path));
  for (const name of ["test/fixtures/churn.html", "test/fixtures/explain.html", "test/fixtures/explain-tools.js"]) assert.ok(files.has(name), name);
});

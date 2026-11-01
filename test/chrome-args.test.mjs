import test from "node:test";
import assert from "node:assert/strict";
import { chromeArgs } from "../lib/chrome-args.mjs";

test("launch never touches the macOS keychain", () => {
  const args = chromeArgs({ profileDir: "/tmp/p", extensionDir: "/tmp/e" });
  assert.ok(args.includes("--use-mock-keychain"));
  assert.ok(args.includes("--password-store=basic"));
});

test("profile, extension, headless and urls are passed through; urls come last", () => {
  const args = chromeArgs({ profileDir: "/tmp/p", extensionDir: "/tmp/e", headless: true, urls: ["http://127.0.0.1:8765/"] });
  assert.equal(args[0], "--user-data-dir=/tmp/p");
  assert.ok(args.includes("--load-extension=/tmp/e"));
  assert.ok(args.includes("--headless=new"));
  assert.equal(args.at(-1), "http://127.0.0.1:8765/");
});

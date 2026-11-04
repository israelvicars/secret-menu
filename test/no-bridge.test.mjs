import test from "node:test";
import assert from "node:assert/strict";
import { NO_BRIDGE, startBridge } from "../ext/src/bridge/background.js";
import { isNoBridge } from "../ext/src/lib/no-bridge.ts";

// A minimal fake chrome: every event has addListener; connectNative returns a port whose disconnect we drive.
function fakeChrome() {
  const ports = [], listeners = {};
  const event = (name) => ({ addListener: (fn) => { (listeners[name] ??= []).push(fn); }, removeListener() {} });
  const runtime = {
    lastError: undefined,
    getManifest: () => ({ version: "0.0.0" }),
    onMessage: event("runtime.onMessage"),
    connectNative: () => {
      const port = { msg: [], disc: [], sent: [], onMessage: { addListener: (f) => port.msg.push(f) }, onDisconnect: { addListener: (f) => port.disc.push(f) }, postMessage: (m) => port.sent.push(m) };
      ports.push(port); return port;
    },
  };
  const tabs = new Proxy({}, { get: (_, k) => (String(k).startsWith("on") ? event(`tabs.${String(k)}`) : async () => []) });
  return { chrome: { runtime, tabs, scripting: { executeScript: async () => [] } }, ports, listeners };
}

test("missing native host: quiet retries, and page requests get the setup hint", async (t) => {
  const fake = fakeChrome();
  globalThis.chrome = fake.chrome;
  const warnings = [], errors = [];
  t.mock.method(console, "warn", (...a) => warnings.push(a));
  t.mock.method(console, "error", (...a) => errors.push(a));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const bridge = startBridge();
    assert.equal(fake.ports.length, 1);
    // Chrome reports "not found" right away when `secret-menu setup` has not run.
    fake.chrome.runtime.lastError = { message: "Specified native messaging host not found." };
    fake.ports[0].disc.forEach((f) => f());
    fake.chrome.runtime.lastError = undefined;
    await assert.rejects(bridge.hostRequest("index_list"), (e) => e.message === NO_BRIDGE && isNoBridge(e.message));
    t.mock.timers.tick(500);
    assert.equal(fake.ports.length, 2, "retries");
    assert.deepEqual(warnings, []); assert.deepEqual(errors, []);
    // A host that did talk to us and then went away gets one warning.
    fake.ports[1].msg.forEach((f) => f({ type: "noop" }));
    fake.ports[1].disc.forEach((f) => f());
    assert.equal(warnings.length, 1);
  } finally { t.mock.timers.reset(); delete globalThis.chrome; }
});

test("isNoBridge matches only the no-bridge message", () => {
  assert.ok(isNoBridge(NO_BRIDGE));
  assert.ok(!isNoBridge("The Secret Menu bridge did not answer in time."));
});

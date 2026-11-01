import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addToPolicy, decideTool, loadPolicy, normalizeOrigin, removeFromPolicy, savePolicy } from "../lib/policy.mjs";

const ORIGIN = "https://guavanumbers.com";
const t = (name, readOnly = false) => ({ name, annotations: readOnly ? { readOnlyHint: true } : {} });
const policy = { sites: { [ORIGIN]: { mode: "strict", allow: ["get_account_status", "list_numbers", "get_plan_info"] }, "http://127.0.0.1:8765": { mode: "allowlist", allow: ["get_account"] } } };

test("allowlisted tools run without approval", () => {
  assert.deepEqual(decideTool(policy, `${ORIGIN}/app`, t("list_numbers")).action, "run");
  assert.equal(decideTool(policy, ORIGIN, t("list_numbers")).approval, "allowlist");
});

test("strict sites refuse every other tool, even ones marked read-only", () => {
  for (const name of ["purchase_number", "cancel_number", "logout"]) assert.equal(decideTool(policy, ORIGIN, t(name)).action, "refuse");
  assert.equal(decideTool(policy, ORIGIN, t("search_numbers", true)).action, "refuse");
  assert.match(decideTool(policy, ORIGIN, t("purchase_number")).reason, /strict site policy/);
});

test("with the guard on, non-strict and unknown sites fall back to the default rules", () => {
  const guarded = { ...policy, safety: { guard: true, audit: true } };
  assert.equal(decideTool(guarded, "http://127.0.0.1:8765/", t("get_account")).action, "run");
  assert.equal(decideTool(guarded, "http://127.0.0.1:8765/", t("add_to_cart")).action, "approve");
  assert.equal(decideTool(guarded, "http://127.0.0.1:8765/", t("get_status", true)).action, "run");
  assert.equal(decideTool({ safety: { guard: true }, sites: {} }, "https://example.com", t("x")).action, "approve");
});

test("safety is opt-in: guard off lets calls run, but site entries still apply", () => {
  assert.deepEqual(loadPolicy("/nonexistent/secret-menu/sites.json").safety, { guard: false, audit: false });
  assert.equal(decideTool({ sites: {} }, "https://example.com", t("add_to_cart")).action, "run");
  assert.equal(decideTool({ sites: {} }, "https://example.com", t("add_to_cart")).approval, "guard-off");
  assert.equal(decideTool(policy, ORIGIN, t("purchase_number")).action, "refuse");
  const kept = addToPolicy({ safety: { guard: true, audit: true }, sites: {} }, "https://a.example", ["x"]);
  assert.deepEqual(kept.safety, { guard: true, audit: true });
  assert.deepEqual(removeFromPolicy(kept, "https://a.example").safety, { guard: true, audit: true });
});

test("origins are normalized and the file round-trips", () => {
  assert.equal(normalizeOrigin("HTTPS://GuavaNumbers.com/app?x=1"), ORIGIN);
  const dir = mkdtempSync(join(tmpdir(), "secret-menu-policy-"));
  const path = join(dir, "sites.json");
  assert.deepEqual(loadPolicy(path), { safety: { guard: false, audit: false }, sites: {} });
  let p = addToPolicy(loadPolicy(path), "https://guavanumbers.com/app", ["get_account_status", "list_numbers"], { strict: true });
  p = addToPolicy(p, ORIGIN, ["list_numbers", "get_plan_info"]);
  savePolicy(path, p);
  assert.deepEqual(loadPolicy(path).sites[ORIGIN], { mode: "strict", allow: ["get_account_status", "list_numbers", "get_plan_info"] });
  assert.deepEqual(removeFromPolicy(loadPolicy(path), ORIGIN, ["list_numbers"]).sites[ORIGIN].allow, ["get_account_status", "get_plan_info"]);
  assert.deepEqual(removeFromPolicy(loadPolicy(path), ORIGIN).sites, {});
  assert.ok(readFileSync(path, "utf8").endsWith("\n"));
});

test("a malformed policy file is an error, not an open door", () => {
  const dir = mkdtempSync(join(tmpdir(), "secret-menu-policy-"));
  const path = join(dir, "sites.json");
  writeFileSync(path, "{ not json");
  assert.throws(() => loadPolicy(path), /Invalid site policy/);
  writeFileSync(path, JSON.stringify({ sites: { [ORIGIN]: { mode: "yolo" } } }));
  assert.throws(() => loadPolicy(path), /Invalid mode/);
});

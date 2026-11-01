// Per-site tool policy, stored locally in DATA_HOME/sites.json:
// { "sites": { "https://guavanumbers.com": { "mode": "strict", "allow": ["get_account_status"] } } }
// - a tool in `allow` runs without an approval prompt (use only for tools you know are read-only);
// - mode "strict" refuses every tool not in `allow`, even ones the page marks read-only;
// - otherwise, with the safety guard ON, readOnlyHint tools run and everything else needs approval;
// - with the guard OFF (the default), Secret Menu is a road, not a police: calls run and the agent's own
//   approval UI decides. Site entries above still apply either way (an entry is an explicit opt-in).
// Top-level "safety": { "guard": false, "audit": false } — both opt-in (`secret-menu safety on|off`).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function normalizeOrigin(value) {
  try { return new URL(String(value)).origin.toLowerCase(); } catch { throw new Error(`Not a valid origin: ${value}`); }
}

export function loadPolicy(path) {
  if (!existsSync(path)) return { safety: { ...SAFETY_DEFAULT }, sites: {} };
  let data;
  try { data = JSON.parse(readFileSync(path, "utf8")); } catch (e) { throw new Error(`Invalid site policy ${path}: ${e.message}`); }
  const sites = {};
  for (const [key, entry] of Object.entries(data?.sites ?? {})) {
    const mode = entry?.mode ?? "allowlist";
    if (!["allowlist", "strict"].includes(mode)) throw new Error(`Invalid mode for ${key} in ${path}: ${mode}`);
    if (entry?.allow != null && !Array.isArray(entry.allow)) throw new Error(`"allow" for ${key} in ${path} must be a list of tool names`);
    sites[normalizeOrigin(key)] = { mode, allow: [...new Set((entry?.allow ?? []).map(String))] };
  }
  const s = data?.safety ?? {};
  return { safety: { guard: s.guard === true, audit: s.audit === true }, sites };
}
export const SAFETY_DEFAULT = Object.freeze({ guard: false, audit: false });

export function savePolicy(path, policy) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

export function siteFor(policy, origin) {
  return policy?.sites?.[normalizeOrigin(origin)] ?? null;
}

// Returns { action: "run" | "approve" | "refuse", approval?, reason }
export function decideTool(policy, origin, tool) {
  const site = siteFor(policy, origin);
  const name = tool?.name;
  if (site?.allow.includes(name)) return { action: "run", approval: "allowlist", reason: `${name} is on the allowlist for ${normalizeOrigin(origin)}` };
  if (site?.mode === "strict") return { action: "refuse", reason: `refused by strict site policy: ${name} is not on the allowlist for ${normalizeOrigin(origin)}` };
  if (tool?.annotations?.readOnlyHint === true) return { action: "run", approval: "read-only", reason: "page marks the tool read-only" };
  if (policy?.safety?.guard !== true) return { action: "run", approval: "guard-off", reason: "safety guard is off; the agent's own approval UI decides" };
  return { action: "approve", reason: "tool is not marked read-only" };
}

export function addToPolicy(policy, origin, tools = [], { strict } = {}) {
  const key = normalizeOrigin(origin);
  const site = policy.sites[key] ?? { mode: "allowlist", allow: [] };
  const next = { mode: strict === undefined ? site.mode : (strict ? "strict" : "allowlist"), allow: [...new Set([...site.allow, ...tools.map(String)])] };
  return { ...policy, sites: { ...policy.sites, [key]: next } };
}

export function removeFromPolicy(policy, origin, tools = []) {
  const key = normalizeOrigin(origin);
  const sites = { ...policy.sites };
  if (!sites[key]) return { ...policy, sites };
  if (!tools.length) { delete sites[key]; return { ...policy, sites }; }
  sites[key] = { ...sites[key], allow: sites[key].allow.filter((t) => !tools.includes(t)) };
  return { ...policy, sites };
}

// Passive learning: cache what each site can do, and remember tool sequences that worked.
// Everything lives under ~/.secret-menu (index/ and recipes/). No tool results or arguments
// values are stored, only origins, tool names and argument key names.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { INDEX_SCHEMA } from "./discover.mjs";

const writeJson = (path, value) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n"); renameSync(tmp, path); };
const readJson = (path, fallback) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } };

export function cacheExplain(home, report) {
  if (!report?.indexKey) return null;
  const dir = join(home, "index"); mkdirSync(dir, { recursive: true });
  const host = new URL(report.indexKey).host;
  const entry = {
    schema: INDEX_SCHEMA, indexKey: report.indexKey, verifiedAt: report.verifiedAt ?? new Date().toISOString(), toolsDigest: report.toolsDigest ?? null,
    title: report.page?.title ?? null, description: report.page?.description ?? null, counts: report.counts ?? null,
    abilities: (report.abilities ?? []).map((a) => ({ title: a.title, label: a.label, toolNames: a.toolNames })),
  };
  writeJson(join(dir, `${host}.json`), entry);
  return entry;
}
export function readIndex(home) {
  const dir = join(home, "index"); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(join(dir, f), null)).filter(Boolean);
}
const toks = (s) => String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
// Which cached sites can do this task? Works with no browser at all.
export function findSites(home, task, { limit = 10 } = {}) {
  const want = new Set(toks(task).map((w) => w.replace(/s$/, "")));
  return readIndex(home).map((e) => {
    const hay = [e.title, e.description, ...e.abilities.flatMap((a) => [a.title, ...(a.toolNames ?? [])])].join(" ");
    const have = new Set(toks(hay.replace(/_/g, " ")).map((w) => w.replace(/s$/, "")));
    const score = [...want].filter((w) => have.has(w)).length;
    return { score, site: e.indexKey, title: e.title, verifiedAt: e.verifiedAt, abilities: e.abilities.map((a) => `${a.title} [${a.label}]`) };
  }).filter((x) => !want.size || x.score > 0).sort((a, b) => b.score - a.score || a.site.localeCompare(b.site)).slice(0, limit);
}

// A session trace is the list of successful page-tool calls in one MCP session.
export function traceStep({ origin, tool, args }) { return { origin, tool, argKeys: Object.keys(args ?? {}).sort() }; }
export function candidateFrom(steps, { source }) {
  if (!steps.length) return null;
  const tools = [];
  for (const s of steps) { const last = tools.at(-1); if (last && last.tool === s.tool && JSON.stringify(last.argKeys) === JSON.stringify(s.argKeys)) { if (!last.sites.includes(s.origin)) last.sites.push(s.origin); } else tools.push({ tool: s.tool, argKeys: s.argKeys, sites: [s.origin] }); }
  const signature = createHash("sha256").update(JSON.stringify(tools.map((t) => [t.tool, t.argKeys, [...t.sites].sort()]))).digest("hex").slice(0, 16);
  return { signature, steps: tools, source };
}
// Upsert: the same sequence seen again bumps its count, so repeated successes rise to the top.
export function recordCandidate(home, candidate, { minSteps = 2 } = {}) {
  if (!candidate) return null;
  const calls = candidate.steps.reduce((n, s) => n + s.sites.length, 0);
  if (calls < minSteps) return null;
  const dir = join(home, "recipes"); mkdirSync(dir, { recursive: true });
  const path = join(dir, "candidates.json");
  const all = readJson(path, { schema: "secret-menu.candidates/v1", candidates: [] });
  const now = new Date().toISOString();
  const found = all.candidates.find((c) => c.signature === candidate.signature);
  if (found) { found.count += 1; found.lastSeen = now; } else all.candidates.push({ ...candidate, status: "candidate", count: 1, firstSeen: now, lastSeen: now });
  all.candidates.sort((a, b) => b.count - a.count);
  writeJson(path, all);
  return found ?? all.candidates.find((c) => c.signature === candidate.signature);
}
export function readCandidates(home) { return readJson(join(home, "recipes", "candidates.json"), { candidates: [] }).candidates; }

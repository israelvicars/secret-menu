import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheExplain, candidateFrom, findSites, readCandidates, recordCandidate, traceStep } from "../lib/learn.mjs";

test("explain cache feeds find_sites with no browser", () => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-learn-"));
  try {
    cacheExplain(home, { indexKey: "https://www.allbirds.com", verifiedAt: "2026-10-31T06:00:00Z", toolsDigest: "sha256:x", page: { title: "Allbirds", description: "Sustainable shoes" }, abilities: [{ title: "Search the store catalog", label: "safe", toolNames: ["search_catalog"] }] });
    cacheExplain(home, { indexKey: "https://radar.example", page: { title: "Radar" }, abilities: [{ title: "Look up an address", label: "safe", toolNames: ["geocode"] }] });
    const hits = findSites(home, "search catalog for shoes");
    assert.equal(hits[0].site, "https://www.allbirds.com"); assert.equal(hits.length, 1);
    assert.equal(hits[0].verifiedAt, "2026-10-31T06:00:00Z");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("successful sequences become candidates and repeats bump the count", () => {
  const home = mkdtempSync(join(tmpdir(), "secret-menu-learn-"));
  try {
    const steps = ["https://a.example", "https://b.example"].map((origin) => traceStep({ origin, tool: "search_catalog", args: { catalog: { query: "secret" } } }));
    const c = candidateFrom(steps, { source: "mcp-session" });
    assert.equal(c.steps.length, 1); assert.deepEqual(c.steps[0].sites, ["https://a.example", "https://b.example"]);
    assert.ok(!JSON.stringify(c).includes("secret")); // argument values are never stored
    recordCandidate(home, c); recordCandidate(home, candidateFrom(steps, { source: "mcp-session" }));
    assert.equal(readCandidates(home)[0].count, 2);
    assert.equal(recordCandidate(home, candidateFrom(steps.slice(0, 1), { source: "x" })), null); // one call is not a sequence
  } finally { rmSync(home, { recursive: true, force: true }); }
});

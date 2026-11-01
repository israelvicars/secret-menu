import test from "node:test";
import assert from "node:assert/strict";
import { appendAudit, nextAuditRecord, readAuditAnchor, verifyAudit } from "../lib/audit.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("audit chain verifies and detects tampering", () => { const a = nextAuditRecord(null, { ts: "a", method: "one" }); const b = nextAuditRecord(a, { ts: "b", method: "two" }); assert.deepEqual(verifyAudit([a, b]), { ok: true, count: 2 }); assert.deepEqual(verifyAudit([a, { ...b, method: "changed" }]), { ok: false, seq: 2 }); });

test("audit anchor detects a truncated tail", () => {
  const dir = mkdtempSync(join(tmpdir(), "secret-menu-audit-")), path = join(dir, "audit.jsonl");
  try {
    const a = appendAudit(path, { ts: "a", method: "one" });
    const b = appendAudit(path, { ts: "b", method: "two" });
    const rows = JSON.parse(`[${readFileSync(path, "utf8").trim().split("\n").join(",")}]`);
    assert.deepEqual(readAuditAnchor(path), { seq: b.seq, hash: b.hash });
    assert.deepEqual(verifyAudit(rows.slice(0, 1), readAuditAnchor(path)), { ok: false, truncated: true, expectedSeq: 2, foundSeq: 1 });
    assert.equal(a.seq, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonical, sha256 } from "./core.mjs";

export function nextAuditRecord(previous, fields) {
  const base = { seq: (previous?.seq ?? 0) + 1, ...fields, prev: previous?.hash ?? "" };
  return { ...base, hash: sha256(base.prev + canonical(base)) };
}
export function readAudit(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}
export function appendAudit(path, fields) {
  const rows = readAudit(path), rec = nextAuditRecord(rows.at(-1), fields);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, JSON.stringify(rec) + "\n", { mode: 0o600 });
  const head = `${path}.head`;
  writeFileSync(head, JSON.stringify({ seq: rec.seq, hash: rec.hash }) + "\n", { mode: 0o600 });
  chmodSync(head, 0o600);
  return rec;
}
export function readAuditAnchor(path) { try { return JSON.parse(readFileSync(`${path}.head`, "utf8")); } catch { return null; } }
export function verifyAudit(rows, anchor = null) {
  let prev = null;
  for (const rec of rows) {
    const { hash, ...base } = rec;
    const expected = sha256((prev?.hash ?? "") + canonical(base));
    if (rec.seq !== (prev?.seq ?? 0) + 1 || rec.prev !== (prev?.hash ?? "") || hash !== expected) return { ok: false, seq: rec.seq };
    prev = rec;
  }
  if (anchor && ((rows.at(-1)?.seq ?? 0) < anchor.seq || rows.at(-1)?.hash !== anchor.hash)) {
    return { ok: false, truncated: true, expectedSeq: anchor.seq, foundSeq: rows.at(-1)?.seq ?? 0 };
  }
  return { ok: true, count: rows.length };
}

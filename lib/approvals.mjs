import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "./core.mjs";

export const approvalMatches = (a, req, now = Date.now()) => a?.status === "approved" && now - Date.parse(a.createdAt) <= 600000 && a.origin === req.origin && a.tool === req.tool && canonical(a.args) === canonical(req.args);
const sameRequest = (a, req) => a?.origin === req.origin && a?.tool === req.tool && canonical(a.args) === canonical(req.args);
const recent = (a, now) => now - Date.parse(a.createdAt) <= 600000;
export const pendingApprovalMatches = (a, req, now = Date.now()) => a?.status?.toLowerCase() === "pending" && recent(a, now) && sameRequest(a, req);
export const deniedApprovalMatches = (a, req, now = Date.now()) => a?.status?.toLowerCase() === "denied" && now - Date.parse(a.decidedAt ?? a.createdAt) <= 600000 && sameRequest(a, req);
export function createApproval(dir, data) { mkdirSync(dir, { recursive: true, mode: 0o700 }); const rec = { id: randomBytes(8).toString("hex"), ...data, createdAt: new Date().toISOString(), status: "pending" }; writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec, null, 2), { mode: 0o600 }); return rec; }
export function readApproval(dir, id) { try { return JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")); } catch { return null; } }
export function writeApproval(dir, rec) { writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec, null, 2), { mode: 0o600 }); }
export function consumeApproval(dir, id) { rmSync(join(dir, `${id}.json`), { force: true }); }
export function listApprovals(dir) { try { return readdirSync(dir).filter((x) => x.endsWith(".json")).map((x) => readApproval(dir, x.slice(0, -5))).filter(Boolean); } catch { return []; } }

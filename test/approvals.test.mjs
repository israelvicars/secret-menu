import test from "node:test";
import assert from "node:assert/strict";
import { approvalMatches, deniedApprovalMatches, pendingApprovalMatches } from "../lib/approvals.mjs";

test("approval is exact, approved, and expires", () => { const now = Date.now(), rec = { status: "approved", createdAt: new Date(now - 1000).toISOString(), origin: "https://x.test", tool: "buy", args: { b: 2, a: 1 } }; assert.equal(approvalMatches(rec, { origin: "https://x.test", tool: "buy", args: { a: 1, b: 2 } }, now), true); assert.equal(approvalMatches(rec, { origin: "https://x.test", tool: "buy", args: { a: 2 } }, now), false); assert.equal(approvalMatches(rec, { origin: "https://x.test", tool: "buy", args: { a: 1, b: 2 } }, now + 700000), false); });

test("pending and recent denied approvals match the exact request", () => {
  const now = Date.now(), req = { origin: "https://x.test", tool: "buy", args: { a: 1 } };
  assert.equal(pendingApprovalMatches({ status: "PENDING", createdAt: new Date(now - 1000).toISOString(), ...req }, req, now), true);
  assert.equal(deniedApprovalMatches({ status: "DENIED", decidedAt: new Date(now - 1000).toISOString(), ...req }, req, now), true);
  assert.equal(deniedApprovalMatches({ status: "denied", decidedAt: new Date(now - 700000).toISOString(), ...req }, req, now), false);
});

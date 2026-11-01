import test from "node:test";
import assert from "node:assert/strict";
import { redactText } from "../lib/redact.mjs";

test("emails, phone numbers and keyed personal fields are redacted", () => {
  const input = JSON.stringify({ email: "someone@example.com", note: "call +18559002272 or (555) 123-4567, mail a.b+c@x.co", card: { last4: "4242" }, ok: true, numbers: [] });
  const out = redactText(input);
  assert.doesNotMatch(out, /example\.com|8559002272|123-4567|x\.co|4242/);
  assert.match(out, /"ok":true/);
  assert.match(out, /\[redacted\]/);
});

test("ordinary audit fields survive", () => {
  const row = '{"seq":385,"ts":"2026-10-31T04:59:05.000Z","origin":"https://guavanumbers.com","tool":"list_numbers","durationMs":95}';
  assert.equal(redactText(row), row);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEY_SVG, MARK_LABEL, MARK_SVG } from "../ext/src/lib/mark.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url));

test("the 🗝️ mark is decorative SVG and its name stays plain", () => {
  for (const svg of [KEY_SVG, MARK_SVG]) { assert.match(svg, /^<svg [^>]*aria-hidden="true"/); assert.match(svg, /viewBox="0 0 36 36"/); }
  assert.equal(MARK_LABEL, "Secret Menu");
  assert.doesNotMatch(MARK_LABEL, /\p{Extended_Pictographic}/u);
});

test("extension icons are PNGs at 16/32/48/128 and the Twemoji license is noted", () => {
  for (const size of [16, 32, 48, 128]) {
    const png = read(`ext/public/icon/${size}.png`);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size]);
  }
  assert.match(read("NOTICE.md").toString(), /Twemoji.*\n?.*CC-BY 4\.0/s);
});

test("the badge uses the mark, hidden from the AX tree, and no emoji reaches an aria-label", () => {
  const badge = read("ext/src/entrypoints/badge.content/index.ts").toString();
  assert.match(badge, /<span class="sm-icon" aria-hidden="true">\$\{MARK_SVG\}<\/span>/);
  for (const [, label] of badge.matchAll(/aria-label="([^"]*)"/g)) assert.doesNotMatch(label, /\p{Extended_Pictographic}/u);
  for (const f of ["popup", "discover", "handoff"]) assert.doesNotMatch(read(`ext/src/entrypoints/${f}/index.html`).toString().match(/<title>(.*)<\/title>/)[1], /\p{Extended_Pictographic}/u);
});

test("#22: the mark is the light key on one dark tile with a subtle edge, same image in both themes", () => {
  assert.match(MARK_SVG, /<rect [^>]*fill="#1F1F1F"[^>]*stroke="#464646"[^>]*stroke-width="1"/);
  assert.doesNotMatch(MARK_SVG, /#F4EAD5|#C9B48A|#31373D|#67757F/);
  assert.match(MARK_SVG, /#E8EAED/);
  assert.match(KEY_SVG, /#31373D/); // the bare key keeps its original Twemoji colors
  const css = read("ext/src/entrypoints/badge.content/style.css").toString();
  assert.doesNotMatch(css, /prefers-color-scheme[^}]*sm-icon/s);
});

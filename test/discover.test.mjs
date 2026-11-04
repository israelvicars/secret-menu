import { test } from "node:test";
import assert from "node:assert/strict";
import { categorize, directory, displayName, recommend, searchCards, showRecommended, siteCards, CATEGORIES } from "../lib/discover.mjs";

const shop = (host, title, verifiedAt, tools = 12) => ({ schema: "secret-menu.index/v1", indexKey: `https://${host}`, verifiedAt, title, description: null, counts: { tools }, abilities: [
  { title: "Search catalog and see cart", label: "safe", toolNames: ["search_catalog", "get_cart"] },
  { title: "Proceed to checkout", label: "spends money", toolNames: ["proceed_to_checkout"] }] });
const radar = { schema: "secret-menu.index/v1", indexKey: "https://radar.cloudflare.com", verifiedAt: "2026-10-30T00:00:00Z", title: "Cloudflare Radar", counts: { tools: 6 }, abilities: [{ title: "Set date range", label: "changes the view", toolNames: ["set-date-range", "get-current-view"] }, { title: "Traffic stats", label: "safe", toolNames: ["get_traffic_stats"] }] };

test("categorize: Shopify-style tools are Shopping; says it's a guess", () => {
  const c = categorize(shop("www.allbirds.com", "Allbirds: Shoes", "2026-10-31T00:00:00Z"));
  assert.equal(c.category, "Shopping"); assert.match(c.basis, /guessed/);
  assert.equal(categorize(radar).category, "Data / News");
  assert.equal(categorize({ abilities: [{ title: "Frobnicate", toolNames: ["frobnicate"] }] }).category, "Other");
});

test("displayName trims the marketing tail, falls back to host", () => {
  assert.equal(displayName({ title: "Allbirds: Comfortable, Sustainable Shoes & Apparel", indexKey: "https://www.allbirds.com" }), "Allbirds");
  assert.equal(displayName({ title: "Glossier | Skincare", indexKey: "https://www.glossier.com" }), "Glossier");
  assert.equal(displayName({ title: null, indexKey: "https://www.awaytravel.com" }), "awaytravel.com");
});

test("directory: only real index entries, top by tool count, empty categories listed", () => {
  const d = directory([shop("www.allbirds.com", "Allbirds", "2026-10-31T00:00:00Z", 12), shop("www.glossier.com", "Glossier", "2026-10-30T00:00:00Z", 13), { schema: "other" }, null]);
  assert.equal(d.total, 2);
  assert.deepEqual(d.sections.map((s) => s.category), ["Shopping"]);
  assert.deepEqual(d.sections[0].sites.map((s) => s.host), ["www.glossier.com", "www.allbirds.com"]);
  assert.deepEqual(d.emptyCategories, CATEGORIES.filter((c) => c !== "Shopping"));
  assert.equal(directory([]).total, 0);
});

test("recommend: same category as the most recently verified site, with its reason; honest when empty", () => {
  const all = [shop("www.allbirds.com", "Allbirds", "2026-10-31T06:54:00Z"), shop("www.glossier.com", "Glossier", "2026-10-31T06:50:00Z"), shop("www.awaytravel.com", "Away", "2026-10-31T06:55:00Z"), radar];
  const r = recommend(all);
  assert.equal(r.anchor.host, "www.awaytravel.com");
  assert.deepEqual(r.items.map((i) => i.host).sort(), ["www.allbirds.com", "www.glossier.com"]);
  assert.match(r.reason, /Shopping, like awaytravel\.com/);
  assert.deepEqual(recommend([]).items, []); assert.match(recommend([]).reason, /No sites/);
  assert.match(recommend([radar]).reason, /Only one site/);
  assert.match(recommend([radar, { ...shop("www.allbirds.com", "Allbirds", "2026-10-31T00:00:00Z") }]).reason, /Nothing else/);
  // Local test pages never count as recommendations.
  assert.equal(recommend([shop("127.0.0.1:8765", "Fixture", "2026-11-01T00:00:00Z"), shop("www.allbirds.com", "Allbirds", "2026-10-31T00:00:00Z")]).items.length, 0);
});

test("searchCards matches names, abilities and tool names by prefix", () => {
  const cards = siteCards([shop("www.allbirds.com", "Allbirds", "x"), radar]);
  assert.deepEqual(searchCards(cards, "checkout").map((c) => c.host), ["www.allbirds.com"]);
  assert.deepEqual(searchCards(cards, "traffic").map((c) => c.host), ["radar.cloudflare.com"]);
  assert.equal(searchCards(cards, "").length, 2);
  assert.equal(searchCards(cards, "flights").length, 0);
});

test("recommended is shown only when it adds a site beyond displayed categories", () => {
  const a = { site: "https://a.example" }, b = { site: "https://b.example" };
  assert.equal(showRecommended([a], [a]), false);
  assert.equal(showRecommended([a, b], [a]), true);
  assert.equal(showRecommended([], [a]), false);
  assert.equal(showRecommended([b], [a], { query: "search" }), false);
});

test("one-liners are a single sentence-case line", () => {
  const cards = siteCards([{ schema: "secret-menu.index/v1", indexKey: "https://x.example", title: "X", abilities: [
    { title: "Search products", label: "safe", toolNames: ["search"] },
    { title: "See your orders", label: "safe", toolNames: ["orders"] },
  ] }]);
  assert.equal(cards[0].oneLiner, "Search products; see your orders");
  const acronym = siteCards([{ schema: "secret-menu.index/v1", indexKey: "https://mcp.example", title: "MCP", abilities: [
    { title: "Find docs", label: "safe", toolNames: ["docs"] },
    { title: "MCP settings", label: "safe", toolNames: ["settings"] },
  ] }]);
  assert.equal(acronym[0].oneLiner, "Find docs; MCP settings");
});

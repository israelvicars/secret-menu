import test from "node:test";
import assert from "node:assert/strict";
import { MUTATING_TOOL, compareShopify, normalizeProducts, parseQuery, relevance, renderComparison } from "../lib/recipes.mjs";

const product = (title, cents, extra = {}) => ({ title, handle: title.toLowerCase().replace(/[^a-z]+/g, "-"), url: `/products/${title.toLowerCase().replace(/[^a-z]+/g, "-")}`, price_range: { amount: cents, currency: "USD", display: `$${(cents / 100).toFixed(2)}` }, available: true, product_type: extra.type ?? null, ...extra });
const sc = (...products) => ({ content: [{ type: "text", text: "Next steps: call add_to_cart ..." }], structuredContent: { products } });

test("query parsing drops gender, price words and plurals", () => {
  assert.deepEqual(parseQuery("women's sneakers under $120"), { gender: "women", terms: ["sneaker"] });
  assert.deepEqual(parseQuery("bags"), { gender: null, terms: ["bag"] });
});

test("relevance keeps real sneakers and drops backpacks, slides and men's shoes", () => {
  const q = "women's sneakers";
  assert.equal(relevance(q, { name: "Women's Tree Runner NZ - Natural Black", type: "Shoes" }).ok, true);
  assert.equal(relevance(q, { name: "Women's Strider - Blizzard", type: "Shoes" }).ok, true);
  assert.equal(relevance(q, { name: "Sport Backpack in Salt White", type: "Bags" }).ok, false);
  assert.equal(relevance(q, { name: "Women's Allbirds Slide - Anthracite", type: "Shoes" }).ok, false);
  assert.equal(relevance(q, { name: "Men's Tree Runner", type: "Shoes" }).ok, false);
  assert.equal(relevance("bag", { name: "The Beauty Bag" }).ok, true);
  assert.equal(relevance("socks", { name: "Deodorant Refill Stick" }).ok, false);
});

test("normalizes structured results and the text fallback to absolute URLs and numbers", () => {
  const [a] = normalizeProducts(sc(product("Women's Tree Runner", 10000)), { origin: "https://www.allbirds.com", store: "Allbirds" });
  assert.equal(a.price, 100); assert.equal(a.currency, "USD"); assert.equal(a.url, "https://www.allbirds.com/products/women-s-tree-runner");
  const [b] = normalizeProducts({ content: [{ type: "text", text: "Products:\n- The Beauty Bag (id: gid://shopify/Product/1, handle: the-beauty-bag) - $45.00\n" }] }, { origin: "https://www.glossier.com", store: "Glossier" });
  assert.deepEqual([b.name, b.price, b.url], ["The Beauty Bag", 45, "https://www.glossier.com/products/the-beauty-bag"]);
});

test("compare-shopify filters by relevance and price, retries with item words, and sorts", async () => {
  const calls = [];
  const fake = async (store, query) => {
    calls.push([store.name, query]);
    if (store.name === "Allbirds") return sc(product("Women's Strider", 13000, { type: "Shoes" }), product("Women's Tree Runner", 10000, { type: "Shoes" }), product("Women's Wool Runner", 4900, { type: "Shoes" }));
    if (store.name === "Away") return sc(product("Sport Backpack", 15700, { type: "Bags" }));
    return sc();
  };
  const out = await compareShopify({ query: "women's sneakers", maxPrice: 120 }, fake);
  assert.deepEqual(out.rows.map((r) => [r.store, r.price]), [["Allbirds", 49], ["Allbirds", 100]]);
  assert.ok(calls.some(([s, q]) => s === "Glossier" && q === "sneaker")); // fallback query
  assert.equal(out.stores.find((s) => s.store === "Away").skipped["not a sneaker"], 1);
  assert.match(renderComparison(out), /1\. Allbirds — Women's Wool Runner — \$49\.00/);
  assert.ok(out.notes.some((n) => n.startsWith("Glossier:")));
});

test("a store error is reported, not thrown", async () => {
  const out = await compareShopify({ query: "bag", stores: [{ url: "https://x.example/", name: "X" }] }, async () => { throw new Error("no search_catalog"); });
  assert.equal(out.rows.length, 0); assert.match(out.stores[0].error, /no search_catalog/);
});

test("mutating tool names are recognized", () => {
  for (const n of ["add_to_cart", "cancel_cart", "update_cart_lines", "manage_orders", "proceed_to_checkout"]) assert.ok(MUTATING_TOOL.test(n), n);
  for (const n of ["search_catalog", "get_product", "browse_store", "show_variant", "search_shop_policies_and_faqs"]) assert.ok(!MUTATING_TOOL.test(n), n);
});

test("read-only mode refuses cart and checkout tools even when allow-listed", async () => {
  const { readOnlyRefusalFor } = await import("../lib/recipes.mjs");
  const opts = { readOnly: true, allowTools: ["search_catalog", "get_product", "add_to_cart"], kind: "read" };
  assert.match(readOnlyRefusalFor({ name: "add_to_cart" }, opts), /cart/);
  assert.match(readOnlyRefusalFor({ name: "proceed_to_checkout" }, opts), /read-only/);
  assert.equal(readOnlyRefusalFor({ name: "search_catalog" }, opts), null);
  assert.match(readOnlyRefusalFor({ name: "browse_store" }, opts), /allow-tools/);
  assert.match(readOnlyRefusalFor({ name: "save_note" }, { readOnly: true, kind: "change" }), /changes data/);
  assert.equal(readOnlyRefusalFor({ name: "add_to_cart" }, { readOnly: false, kind: "change" }), null);
});

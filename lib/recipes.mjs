// Recipes: small, read-only plans an agent can run in one call or replay step by step.
// compare-shopify searches several Shopify stores with their own search_catalog tool and
// returns one normalized, price-sorted table. It never touches carts, orders or checkout.

// Tool names that can change or spend. Read-only mode refuses these whatever the site says.
export const MUTATING_TOOL = /cart|checkout|order|purchase|payment|\bpay|cancel|delete|remove|update|subscribe|login|logout|sign_?(in|up)|password|address/i;
export const READ_ONLY_RECIPE_TOOLS = ["search_catalog", "get_product"];
// Why read-only mode refuses a page tool, or null to allow. kind comes from explain's classifyTool.
export function readOnlyRefusalFor(tool, { readOnly, allowTools = [], kind }) {
  if (!readOnly) return null;
  if (MUTATING_TOOL.test(tool.name)) return `read-only mode: ${tool.name} can change a cart, order or account`;
  if (allowTools.length && !allowTools.includes(tool.name)) return `read-only mode: ${tool.name} is not in --allow-tools (${allowTools.join(", ")})`;
  if (!["read", "view", "navigate"].includes(kind)) return `read-only mode: ${tool.name} looks like it ${kind === "spend" ? "spends money" : "changes data"}`;
  return null;
}

export const DEFAULT_STORES = [
  { name: "Allbirds", url: "https://www.allbirds.com/" },
  { name: "Glossier", url: "https://www.glossier.com/" },
  { name: "Away", url: "https://www.awaytravel.com/" },
];

export const RECIPES = [{
  id: "compare-shopify",
  title: "Compare an item across Shopify stores",
  when: "The user wants to compare products, prices or a category across several online stores that run on Shopify (Allbirds, Glossier, Away and about 2 million more).",
  inputs: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look for, in the shopper's words, e.g. \"women's sneakers\" or \"bag\"." },
      maxPrice: { type: "number", description: "Optional price ceiling in the store currency (e.g. 120 for under $120)." },
      stores: { type: "array", description: "Optional. Store home pages, each {url, name?, query?}; query overrides the search words for that store. Defaults to Allbirds, Glossier and Away.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, query: { type: "string" } }, required: ["url"] } },
      limit: { type: "integer", description: "Results to ask each store for (1-10, default 8)." },
    },
    required: ["query"],
  },
  steps: [
    { tool: "open_site", args: { url: "{store.url}" }, note: "once per store; reuses a tab Secret Menu already opened" },
    { tool: "call_page_tool", args: { tabId: "{tabId}", name: "search_catalog", arguments: { catalog: { query: "{store.query ?? query}", pagination: { limit: "{limit}" } } } }, note: "read-only search" },
    { tool: "(local)", note: "keep relevant products under maxPrice, normalize {store, name, price, currency, url}, sort by price" },
  ],
  outputs: "{query, maxPrice, rows: [{store, name, price, currency, url, available}], stores: [{store, query, found, kept, skipped, error?}], notes[]}",
  safety: "Read-only: calls only search_catalog. Never add_to_cart, update_cart_lines, cancel_cart, manage_orders or proceed_to_checkout.",
}];

const STOP = new Set(["a", "an", "the", "for", "with", "and", "or", "of", "in", "on", "under", "below", "less", "than", "over", "to", "across", "cheap", "best", "some", "any"]);
const GENDER = { women: ["women", "womens", "woman", "ladies"], men: ["men", "mens", "man"] };
const CATEGORY = {
  sneaker: { words: ["sneaker", "runner", "trainer", "dasher", "strider", "cruiser", "piper", "courier"], types: ["shoe", "sneaker", "footwear"], exclude: ["slide", "sandal", "flat", "breezer", "slipper", "sock", "boot", "slip"] },
  shoe: { words: ["shoe", "sneaker", "runner", "trainer", "loafer", "boot"], types: ["shoe", "footwear"], exclude: ["sock"] },
  bag: { words: ["bag", "tote", "backpack", "pouch", "duffel", "weekender", "sling", "crossbody", "case", "kit"], types: ["bag", "handbag", "backpack"], exclude: [] },
};
const words = (text) => String(text ?? "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const stem = (w) => (w.length > 3 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -1) : w).replace(/s$/, "");

export function parseQuery(query) {
  const tokens = words(query).filter((w) => !STOP.has(w) && !/^\d+$/.test(w));
  const gender = tokens.find((w) => GENDER.women.includes(w)) ? "women" : tokens.find((w) => GENDER.men.includes(w)) ? "men" : null;
  const terms = tokens.filter((w) => !GENDER.women.includes(w) && !GENDER.men.includes(w)).map(stem);
  return { gender, terms };
}

// Is this product what the shopper asked for? Store search is fuzzy (Glossier answers "socks" with deodorant).
export function relevance(query, product) {
  const { gender, terms } = typeof query === "string" ? parseQuery(query) : query;
  const titleWords = words(product.name).map(stem);
  const all = new Set([...titleWords, ...words(product.type).map(stem), ...words(product.handle).map(stem)]);
  if (gender) {
    const other = gender === "women" ? GENDER.men : GENDER.women;
    const raw = words(product.name);
    if (raw.some((w) => other.includes(w)) && !raw.some((w) => GENDER[gender].includes(w))) return { ok: false, why: "other gender" };
  }
  for (const term of terms) {
    const cat = CATEGORY[term];
    if (cat) {
      if (cat.exclude.some((x) => titleWords.includes(stem(x)))) return { ok: false, why: `not a ${term}` };
      if (!cat.words.some((x) => all.has(stem(x))) && !cat.types.some((x) => words(product.type).map(stem).includes(stem(x)))) return { ok: false, why: `not a ${term}` };
    } else if (![...all].some((w) => w === term || w.startsWith(term))) return { ok: false, why: `no "${term}"` };
  }
  return { ok: true };
}

function moneyFrom(p) {
  const pr = p.price_range ?? p.price ?? {};
  if (typeof pr.amount === "number") return { price: pr.amount / 100, currency: pr.currency ?? "USD" };
  const m = String(pr.display ?? p.price ?? "").match(/([\d,]+(?:\.\d+)?)/);
  return m ? { price: Number(m[1].replace(/,/g, "")), currency: pr.currency ?? "USD" } : { price: null, currency: null };
}

// Accepts a raw call_page_tool result (MCP content and/or structuredContent) and returns plain products.
export function normalizeProducts(result, { origin, store }) {
  const value = result?.structuredContent ?? result?.result?.structuredContent ?? result;
  let products = Array.isArray(value?.products) ? value.products : null;
  if (!products) {
    const text = (result?.content ?? result?.result?.content ?? []).map((c) => c.text ?? "").join("\n") || (typeof result === "string" ? result : "");
    products = [...text.matchAll(/^- (.+?) \(id: ([^,]+), handle: ([^)]+)\) - ([^\n]+)$/gm)].map((m) => ({ title: m[1], id: m[2], handle: m[3], url: `/products/${m[3]}`, price_range: { display: m[4] } }));
  }
  return products.map((p) => {
    const { price, currency } = moneyFrom(p);
    let url = null; try { url = new URL(p.url ?? `/products/${p.handle}`, origin).href; } catch {}
    return { store, name: String(p.title ?? p.name ?? "").trim(), price, currency, url, available: p.available ?? null, type: p.product_type ?? null, handle: p.handle ?? null, id: p.id ?? null };
  });
}

// search(store, query) -> raw search_catalog result. Injected so the logic is testable without a browser.
export async function compareShopify(params, search) {
  const query = String(params.query ?? "").trim();
  if (!query) throw new Error("query is required");
  const maxPrice = params.maxPrice == null ? null : Number(params.maxPrice);
  const stores = (params.stores?.length ? params.stores : DEFAULT_STORES).map((s) => ({ ...s, name: s.name ?? hostName(s.url) }));
  const parsed = parseQuery(query);
  const rows = [], perStore = [], notes = [];
  for (const s of stores) {
    const tried = [s.query ?? query];
    // If the full phrase finds nothing relevant, retry with just the item words (drops gender and adjectives).
    if (!s.query && parsed.terms.length && parsed.terms.join(" ") !== query.toLowerCase()) tried.push(parsed.terms.join(" "));
    const info = { store: s.name, url: s.url, query: tried[0], found: 0, kept: 0, skipped: {} };
    try {
      for (const q of tried) {
        info.query = q; info.skipped = {};
        const products = normalizeProducts(await search(s, q), { origin: new URL(s.url).origin, store: s.name });
        info.found = products.length;
        const keep = [];
        for (const p of products) {
          const r = relevance(s.query ? parseQuery(s.query) : parsed, p);
          const why = !r.ok ? r.why : !(p.price > 0) ? "no price shown" : maxPrice != null && p.price > maxPrice ? `over ${maxPrice}` : null;
          if (why) info.skipped[why] = (info.skipped[why] ?? 0) + 1; else keep.push(p);
        }
        info.kept = keep.length;
        if (keep.length) { rows.push(...keep); break; }
      }
    } catch (e) { info.error = String(e?.message ?? e).slice(0, 200); }
    perStore.push(info);
  }
  const seen = new Set();
  const unique = rows.filter((r) => !seen.has(r.url) && seen.add(r.url)).sort((a, b) => a.price - b.price);
  for (const s of perStore) if (!s.kept && !s.error) notes.push(`${s.store}: nothing matching "${query}"${maxPrice != null ? ` under ${maxPrice}` : ""} (${s.found} search results, skipped: ${Object.entries(s.skipped).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}).`);
  return { recipe: "compare-shopify", query, maxPrice, rows: unique.map(({ store, name, price, currency, url, available }) => ({ store, name, price, currency, url, available })), stores: perStore, notes, verifiedAt: new Date().toISOString() };
}

export function renderComparison(out) {
  const head = `Compared "${out.query}"${out.maxPrice != null ? ` under ${out.maxPrice}` : ""} across ${out.stores.map((s) => s.store).join(", ")}:`;
  const lines = out.rows.length ? out.rows.map((r, i) => `${i + 1}. ${r.store} — ${r.name} — ${r.currency === "USD" ? "$" : ""}${r.price.toFixed(2)}${r.currency && r.currency !== "USD" ? ` ${r.currency}` : ""}${r.available === false ? " (sold out)" : ""}\n   ${r.url}`) : ["(no matching products)"];
  const errs = out.stores.filter((s) => s.error).map((s) => `${s.store}: error: ${s.error}`);
  return [head, ...lines, ...out.notes.map((n) => `note: ${n}`), ...errs].join("\n");
}
function hostName(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

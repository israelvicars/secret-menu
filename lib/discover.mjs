// Discovery directory logic for the extension's Discover page. Input is only the local explain
// index (~/.secret-menu/index, secret-menu.index/v1 entries). Nothing is invented: categories are
// Secret Menu's keyword rules over tool names, ability titles and the page's own title/description,
// and every result says so (basis). No remote directory, no made-up counts.
export const INDEX_SCHEMA = "secret-menu.index/v1";

export const CATEGORIES = ["Shopping", "Travel", "Dev tools", "Data / News", "Finance", "Phone & accounts"];
export const OTHER = "Other";

// Words that point at a category. Tool names count double: they are what the site can actually do.
const RULES = {
  Shopping: ["cart", "checkout", "catalog", "product", "variant", "wishlist", "shop", "store", "order", "apparel", "shoes", "beauty", "skincare", "luggage"],
  Travel: ["flight", "hotel", "booking", "trip", "itinerary", "airport", "reservation", "fare"],
  "Dev tools": ["docs", "api", "sdk", "repo", "deploy", "developer", "code", "bot"],
  "Data / News": ["news", "article", "stats", "chart", "radar", "dataset", "traffic", "report"],
  Finance: ["coin", "crypto", "stock", "market", "exchange", "portfolio", "price"],
  "Phone & accounts": ["phone", "number", "sms", "forwarding", "voicemail"],
};

const words = (s) => String(s ?? "").toLowerCase().replace(/[_-]/g, " ").split(/[^a-z0-9]+/).filter(Boolean).map((w) => w.replace(/s$/, ""));
const hostOf = (key) => { try { return new URL(key).host; } catch { return String(key ?? ""); } };

export function categorize(entry) {
  const toolWords = (entry?.abilities ?? []).flatMap((a) => (a.toolNames ?? []).flatMap(words));
  const textWords = [entry?.title, entry?.description, ...(entry?.abilities ?? []).map((a) => a.title)].flatMap(words);
  let best = OTHER, bestScore = 0;
  for (const cat of CATEGORIES) {
    const keys = new Set(RULES[cat].map((w) => w.replace(/s$/, "")));
    const score = toolWords.filter((w) => keys.has(w)).length * 2 + textWords.filter((w) => keys.has(w)).length;
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return { category: best, score: bestScore, basis: "guessed from tool names and the page's title" };
}

const isLocal = (key) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(String(key ?? ""));

// One card per indexed site, in the order the directory shows them.
export function siteCards(entries) {
  return (entries ?? [])
    .filter((e) => e?.schema === INDEX_SCHEMA && e.indexKey)
    .map((e) => {
      const { category, basis } = categorize(e);
      const host = hostOf(e.indexKey);
      return {
        site: e.indexKey, host, name: displayName(e), title: e.title ?? null, description: e.description ?? null,
        category, categoryBasis: basis, local: isLocal(e.indexKey),
        counts: e.counts ?? null, verifiedAt: e.verifiedAt ?? null, toolsDigest: e.toolsDigest ?? null,
        abilities: (e.abilities ?? []).map((a) => ({ title: a.title, label: a.label, toolNames: a.toolNames ?? [] })),
        oneLiner: (e.abilities ?? []).slice(0, 2).map((a) => a.title).join(" · "),
      };
    })
    .sort((a, b) => (b.counts?.tools ?? 0) - (a.counts?.tools ?? 0) || String(b.verifiedAt).localeCompare(String(a.verifiedAt)) || a.host.localeCompare(b.host));
}

// "Allbirds: Comfortable, Sustainable Shoes" -> "Allbirds"; falls back to the bare host.
export function displayName(entry) {
  const t = String(entry?.title ?? "").split(/\s[|:–—-]\s|:\s/)[0].trim();
  return t && t.length <= 40 ? t : hostOf(entry?.indexKey).replace(/^www\./, "");
}

// Sections for the directory: top sites per category (top = most tools), plus which categories are empty.
export function directory(entries, { perCategory = 5 } = {}) {
  const cards = siteCards(entries);
  const sections = [...CATEGORIES, OTHER].map((category) => ({ category, sites: cards.filter((c) => c.category === category).slice(0, perCategory), total: cards.filter((c) => c.category === category).length }));
  return { total: cards.length, cards, sections: sections.filter((s) => s.total), emptyCategories: CATEGORIES.filter((c) => !cards.some((s) => s.category === c)) };
}

// "Recommended for you" with no profile or history: sites that share a category with the site you
// verified most recently. The reason is returned so the page can show it; empty when there's no basis.
export function recommend(entries, { limit = 4 } = {}) {
  const cards = siteCards(entries).filter((c) => !c.local);
  if (cards.length < 2) return { items: [], anchor: null, reason: cards.length ? "Only one site is indexed so far, so there is nothing to compare it with." : "No sites are indexed yet." };
  const anchor = [...cards].sort((a, b) => String(b.verifiedAt).localeCompare(String(a.verifiedAt)))[0];
  const items = cards.filter((c) => c.site !== anchor.site && c.category === anchor.category && c.category !== OTHER).slice(0, limit);
  if (!items.length) return { items: [], anchor, reason: `Nothing else in your index looks like ${anchor.host} yet.` };
  return { items, anchor, reason: `${anchor.category}, like ${anchor.host.replace(/^www\./, "")} (the site you verified most recently)` };
}

// Case-insensitive search over the same fields find_sites uses.
export function searchCards(cards, query) {
  const want = words(query).filter((w) => w.length > 1);
  if (!want.length) return cards;
  return cards.filter((c) => {
    const have = new Set([c.name, c.host, c.title, c.description, c.category, ...c.abilities.flatMap((a) => [a.title, ...a.toolNames])].flatMap(words));
    return want.every((w) => [...have].some((h) => h.startsWith(w)));
  });
}

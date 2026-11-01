// Page context for `secret-menu explain`: what the site says it is (title, meta description, og tags, h1).
// The extension collects it alongside the tool list; this normalizes, caps and redacts it so the
// deterministic report can be handed to a model-written summary later.
import { redactText } from "./redact.mjs";

const CAP = 300;
const OG_KEYS = ["title", "description", "site_name", "type", "url"];
const clean = (v, cap = CAP) => {
  if (v == null) return null;
  const s = redactText(String(v).replace(/\s+/g, " ").trim());
  if (!s) return null;
  return s.length > cap ? `${s.slice(0, cap - 1)}…` : s;
};

export function normalizePageContext(raw, { title = null, url = null } = {}) {
  if (!raw || typeof raw !== "object") {
    return { source: "tab", title: clean(title), description: null, og: {}, h1: [], lang: null, canonical: null, url: clean(url, 500),
      note: "Only the tab title is available; reload the Secret Menu extension (chrome://extensions) so it also reports meta tags and headings." };
  }
  const og = {};
  for (const k of OG_KEYS) { const v = clean(raw.og?.[k]); if (v) og[k] = v; }
  return {
    source: "extension",
    title: clean(raw.title ?? title),
    description: clean(raw.description),
    og,
    h1: (Array.isArray(raw.h1) ? raw.h1 : []).map((h) => clean(h, 160)).filter(Boolean).slice(0, 3),
    lang: clean(raw.lang, 20),
    canonical: clean(raw.canonical, 500),
    url: clean(raw.url ?? url, 500),
  };
}

// One line for the human view: "Guava Numbers — Get a memorable phone number".
export function pageLine(page) {
  if (!page) return null;
  const name = page.og?.site_name ?? page.title;
  const about = page.description ?? page.og?.description ?? page.h1?.[0] ?? null;
  if (!name && !about) return null;
  return [name, about && about !== name ? about : null].filter(Boolean).join(" — ");
}

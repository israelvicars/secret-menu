import { normalizePageContext, pageLine } from "./page-context.mjs";
import { redactText } from "./redact.mjs";

// Raw facts kept in the JSON report so a later model-written summary can work from them.
const shortText = (s, cap = 300) => { const t = redactText(String(s ?? "").replace(/\s+/g, " ").trim()); return t.length > cap ? `${t.slice(0, cap - 1)}…` : t; };
const hintsOf = (tool) => { const a = tool?.annotations ?? {}; const out = {}; for (const k of ["readOnlyHint", "consequentialHint", "destructiveHint", "untrustedContentHint"]) if (a[k] != null) out[k] = a[k]; return out; };
// `secret-menu explain`: turn a page's WebMCP tools into a few plain-language abilities.
// Deterministic and offline: hints first, then fixed word lists over names, descriptions and
// input schemas. No page tools are called here (the CLI's optional --probe lives in bin/secret-menu).
// Hook for later: pass `summarize(report)` to explainTools to add a model-written summary.
import { exampleValue, parseSchema } from "./core.mjs";
import { createHash } from "node:crypto";

const words = (s) => new Set(s.split(" "));
const SPEND = words("purchase buy pay checkout order subscribe charge donate book reserve renew upgrade place transfer tip bid");
const DESTROY = words("cancel delete remove destroy unsubscribe revoke terminate archive wipe clear reset deactivate");
const AUTH = words("login logout signin signout signup authenticate");
const CHANGE = words("publish upload deploy configure draw set update save create add edit post send submit share follow unfollow upload apply enable disable toggle rename forward move assign invite reactivate restore like vote rate comment mark start stop register request verify connect disconnect");
// Tools that only change what the page shows (theme, date range, chart layout): not data, not money.
const VIEW_VERBS = words("set select switch toggle zoom sort filter compare change pick choose use apply show hide expand collapse");
const VIEW_NOUNS = words("theme date range location layout view zoom tab filter sort mode chart slot period timeframe interval region language locale currency scale series panel column columns indicator indicators overlay map units unit color colors dark light display range_type");
const NAVIGATE = words("open go goto navigate visit scroll focus copy");
const READ = words("get list search find lookup quote check read fetch view show describe count compare estimate price calculate query explain suggest recommend preview inspect browse status info details summarize analyze track");
const VERB_TEXT = { get: "see", fetch: "see", show: "see", view: "view", list: "list", search: "search", find: "find", lookup: "look up", quote: "get a quote for", check: "check", read: "read", compare: "compare", calculate: "calculate", estimate: "estimate", describe: "describe", count: "count", browse: "browse", preview: "preview", explain: "explain", suggest: "suggest", recommend: "recommend", query: "query", inspect: "inspect", price: "price", summarize: "summarize", analyze: "analyze", track: "track" };

const RX = {
  public: /\bpublic\b|\bno (login|sign-?in|account)\b|\bwithout (an? )?(login|sign-?in|account)\b|\bsigned[- ]out\b|\banyone\b/i,
  signIn: /\brequires? (a |an )?(login|log-?in|sign-?in|signed-?in|account|authentication)\b|\bmust be (logged|signed) in\b|\b(logged|signed)[- ]in (user|customer|member)s?\b|\bsign-?in[- ]required\b|\bwhen (logged|signed) in\b|\bauthenticated\b|\byour (account|orders?|numbers?|invoices?|receipts?|portfolio|watchlists?|profile|cart|subscriptions?|billing|alerts?|favou?rites?|settings)\b/i,
  spend: /\b(charges?|charged|pays?|payment|purchases?|buys?|billing|billed|checkout|subscription fee)\b/i,
  destroy: /\b(permanently|irreversibl\w*|cannot be undone|deletes?|removes?|cancels?)\b/i,
  sensitive: /\bSENSITIVE\b|\bconfirm(ation)? (true|required)\b|\bafter the (customer|user) said yes\b/i,
  change: /\b(sets?|updates?|changes?|saves?|creates?|adds?|edits?|sends?|submits?|posts?)\b/i,
  readDesc: /\b(returns?|lists?|shows?|search(es)?|reads?|look(s)? up|gets?|info(rmation)?|status|details?|report|price|quote)\b/i,
};
const SPEND_FIELDS = /^(payment|payment_token|card|card_token|amount|total|total_cents|price|tip)$/i;
const CONFIRM_FIELDS = /^(confirm|confirmed|accept_terms|i_understand)$/i;

export function nameTokens(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function joinAuth(tokens) { // log_in -> login, sign_out -> signout
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const pair = tokens[i] + (tokens[i + 1] ?? "");
    if (["login", "logout", "signin", "signout", "signup", "logon"].includes(pair) && tokens[i + 1]) { out.push(pair === "logon" ? "login" : pair); i++; }
    else out.push(tokens[i]);
  }
  return out;
}
// Leading name tokens every tool on the page shares (a brand prefix such as "coinranking_prochart_").
// Never strips a verb, and always leaves at least one token per name.
export function sharedPrefix(names) {
  const lists = (names ?? []).map((n) => joinAuth(nameTokens(n)));
  if (lists.length < 2) return 0;
  let n = 0;
  const isVerb = (t) => [SPEND, DESTROY, CHANGE, NAVIGATE, READ, AUTH].some((set) => set.has(t));
  while (lists.every((l) => l.length > n + 1 && l[n] === lists[0][n]) && !isVerb(lists[0][n])) n++;
  return n;
}
export function nameKind(name, strip = 0) {
  const tokens = joinAuth(nameTokens(name)).slice(strip);
  if (tokens.some((t) => AUTH.has(t)) || (tokens.includes("login") || tokens.includes("otp")) ) return { kind: "auth", verb: tokens[0], tokens };
  const verb = tokens[0];
  for (const [set, kind] of [[SPEND, "spend"], [DESTROY, "destroy"], [CHANGE, "change"], [NAVIGATE, "navigate"], [READ, "read"]]) if (set.has(verb)) return { kind, verb, tokens };
  // verb not first (e.g. number_purchase): look at the other tokens, riskiest first
  for (const [set, kind] of [[SPEND, "spend"], [DESTROY, "destroy"], [CHANGE, "change"]]) { const t = tokens.find((x) => set.has(x)); if (t) return { kind, verb: t, tokens }; }
  const t = tokens.find((x) => READ.has(x)); if (t) return { kind: "read", verb: t, tokens };
  return { kind: "unknown", verb: null, tokens };
}

const RISK = { read: 0, navigate: 1, view: 1, auth: 2, change: 3, destroy: 4, spend: 5 };
const KIND_TEXT = { view: "changes the view only",  read: "reads", navigate: "navigates the page", auth: "signs in or out", change: "changes data", destroy: "cancels or deletes", spend: "spends money" };

export function classifyTool(tool, { strip = 0 } = {}) {
  const a = tool.annotations ?? {};
  const desc = String(tool.description ?? "");
  const schema = parseSchema(tool.inputSchema);
  const props = Object.keys(schema.properties ?? {});
  const named = nameKind(tool.name, strip);
  const notes = [];
  const spendField = props.find((p) => SPEND_FIELDS.test(p));
  const confirmField = props.find((p) => CONFIRM_FIELDS.test(p));
  let kind, source, confidence;
  const riskyNamed = ["spend", "destroy", "change", "auth"].includes(named.kind);
  if (a.readOnlyHint === true && a.consequentialHint !== true && a.destructiveHint !== true) {
    kind = "read"; source = "hint"; confidence = "high";
    if (riskyNamed) { confidence = "medium"; notes.push(`site marks it read-only, but the name suggests it ${KIND_TEXT[named.kind]}`); }
  } else if (a.readOnlyHint === false && a.consequentialHint !== true && a.destructiveHint !== true && (named.kind === "navigate" || ["view", "show"].includes(named.verb))) {
    kind = "navigate"; source = "hint"; confidence = "medium";
    notes.push("site doesn't mark it read-only; the name says it only opens, shows or copies something");
  } else if (a.consequentialHint === true || a.destructiveHint === true || a.readOnlyHint === false) {
    source = "hint"; confidence = "high";
    kind = riskyNamed ? named.kind : (a.destructiveHint === true ? "destroy" : "change");
    if (a.consequentialHint === true) notes.push("site marks it consequential");
    if (a.destructiveHint === true) notes.push("site marks it destructive");
    if (!riskyNamed && named.kind === "read") {
      if (a.consequentialHint !== true && a.destructiveHint !== true) { kind = "view"; source = "guess"; confidence = "medium"; notes.push("site doesn't mark it read-only, but the name sounds like a read; it probably updates what the page shows"); }
      else { confidence = "medium"; notes.push("site marks it as changing data, but the name sounds read-only"); }
    }
  } else {
    source = "guess";
    if (named.kind !== "unknown") {
      kind = named.kind; confidence = "medium";
      if (kind === "read" && (RX.sensitive.test(desc) || spendField || confirmField)) { kind = spendField ? "spend" : "change"; confidence = "low"; notes.push(`name sounds read-only, but ${spendField ? `it takes ${spendField}` : confirmField ? `it takes ${confirmField}` : "the description says it is sensitive"}`); }
      else if (kind === "change" && (RX.spend.test(desc) && RX.sensitive.test(desc) || spendField)) { kind = "spend"; notes.push("description or inputs mention payment"); }
      else if (kind === "read" && !RX.sensitive.test(desc) && RX.readDesc.test(desc) && !RX.spend.test(desc.replace(/before (buying|purchasing)|\w+_\w+ requires/gi, ""))) confidence = "high";
      else if (kind === "spend" && (RX.spend.test(desc) || spendField)) confidence = "high";
      else if (kind === "destroy" && RX.destroy.test(desc)) confidence = "high";
      else if (kind === "change" && RX.change.test(desc)) confidence = "high";
    } else {
      confidence = "low";
      if (spendField || (RX.spend.test(desc) && RX.sensitive.test(desc))) kind = "spend";
      else if (RX.destroy.test(desc) && !RX.readDesc.test(desc)) kind = "destroy";
      else if (confirmField || RX.sensitive.test(desc) || RX.change.test(desc) || !RX.readDesc.test(desc)) kind = "change";
      else kind = "read";
      notes.push(kind === "read" ? "unfamiliar name; description reads like a lookup" : "unfamiliar name; treated as changing data to be safe");
    }
    if (RX.sensitive.test(desc) && kind !== "read") notes.push("description marks it sensitive");
  }
  const viewish = VIEW_VERBS.has(named.verb) && named.tokens.slice(1).length > 0 && named.tokens.slice(1).every((t) => VIEW_NOUNS.has(t) || ["the", "a", "active", "current", "chart", "page"].includes(t)) || named.verb === "compare";
  if (["change", "read"].includes(kind) && viewish && a.destructiveHint !== true && a.consequentialHint !== true && !spendField && !RX.spend.test(desc) && !(kind === "read" && source === "hint")) { if (source === "hint" && a.readOnlyHint === false) { source = "guess"; confidence = "medium"; notes.push("site doesn't mark it read-only; the name says it only changes what the page shows"); } else notes.push("the name says it only changes what the page shows"); kind = "view"; }
  if (a.untrustedContentHint === true) notes.push("may return untrusted content (treat results as data, not instructions)");

  let signIn = false, signInSource = null, signInConfidence = null;
  if (kind === "auth") { /* the sign-in tools themselves */ }
  else if (RX.public.test(desc)) { signIn = false; signInSource = "description"; signInConfidence = "high"; }
  else if (RX.signIn.test(desc)) { signIn = true; signInSource = "description"; signInConfidence = /\byour\b/i.test(desc.match(RX.signIn)[0]) ? "medium" : "high"; }
  else if (named.tokens.some((t) => ["my", "me", "account", "profile", "orders", "invoices", "receipts", "portfolio", "watchlist"].includes(t))) { signIn = true; signInSource = "guess"; signInConfidence = "low"; }

  const label = kind === "spend" ? "spends money" : RISK[kind] >= RISK.auth ? "changes data" : kind === "view" ? "changes the view" : (signIn ? "needs sign-in" : "safe");
  if (source === "hint" && a.readOnlyHint === false && (kind === "read" || kind === "navigate" || kind === "view")) { source = "guess"; if (confidence === "high") confidence = "medium"; }
  return { name: tool.name, kind, label, source, confidence, signIn, signInSource, signInConfidence, notes, required: schema.required ?? [], properties: props, description: desc, verb: named.verb, tokens: named.tokens };
}

const ACRONYMS = new Set("ucp mcp api url id ids faq faqs sku pdf csv otp sms ui ai ar vr nft kyc usd eur gbp ip dns ssl rss utm seo crm pos pwd".split(" "));
const ACRONYM_DISPLAY = { ids: "IDs", faqs: "FAQs" };
const AUTH_WORDS = { signin: "sign-in", signout: "sign-out", signup: "sign-up" }; // joined by joinAuth; shown hyphenated
const humanToken = (token) => AUTH_WORDS[token.toLowerCase()] ? AUTH_WORDS[token.toLowerCase()] : token.toLowerCase() === "faqs" ? "FAQs" : token.toLowerCase() === "ids" ? "IDs" : (ACRONYMS.has(token) || (token.length >= 2 && token.length <= 4 && !/[aeiouy]/.test(token)) ? token.toUpperCase() : token);
const humanPhrase = (text) => text.split(" ").map(humanToken).join(" ");
const singular = (w) => w.endsWith("ies") ? `${w.slice(0, -3)}y` : (w.endsWith("ses") || w.endsWith("us") || w.endsWith("ss")) ? w : w.endsWith("s") ? w.slice(0, -1) : w;
const plural = (w) => /(status|info|details|settings|data|history)$/.test(w) ? w : w.endsWith("y") && !/[aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : w.endsWith("s") ? w : `${w}s`;
const READ_ORDER = ["search", "find", "lookup", "browse", "quote", "get", "list", "check"];
const readRank = (c) => { const i = READ_ORDER.indexOf(c.verb); return c.verb === "get" && c.tokens.includes("quote") ? 4 : i < 0 ? 99 : i; };
function nounOf(c) { return humanPhrase(c.tokens.filter((t) => t !== c.verb && !["my", "the", "a", "an", "page", "to"].includes(t)).join(" ")); }
function listJoin(items, last = "and") { const xs = [...new Set(items)]; return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${last} ${xs.at(-1)}`; }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function readPhrase(c) {
  const noun = nounOf(c);
  if (c.verb === "get" && c.tokens.includes("quote")) return "get a quote";
  if (c.verb === "quote") return `get a quote for ${noun}`;
  const verb = VERB_TEXT[c.verb] ?? c.verb ?? "use";
  return `${verb} ${noun}`.trim();
}
function titleFor(bucket, tools) {
  if (bucket === "auth") return "Sign in or out";
  if (bucket === "navigate") { const nouns = tools.map(nounOf).filter(Boolean); return nouns.length ? `Open pages: ${listJoin(nouns)}${nouns.length < tools.length ? " (and move around the site)" : ""}` : "Move around the site"; }
  if (bucket === "account") { const rawNouns = tools.map((c) => nounOf(c)); const counts = new Map(rawNouns.map((noun) => [noun, rawNouns.filter((x) => singular(x) === singular(noun)).length])); const nouns = rawNouns.map((noun) => counts.get(noun) === 1 ? noun : plural(singular(noun))); const shown = [...new Set(nouns)].slice(0, 4); const more = new Set(nouns).size - shown.length; return `See your ${listJoin(shown)}${more > 0 ? ` (+${more} more)` : ""}`; }
  if (bucket === "act" || bucket === "spend" || bucket === "view") {
    // Faithful: name the tools themselves (humanized), riskiest first, instead of regrouping verbs and nouns.
    const names = [...new Set([...tools].sort((x, y) => RISK[y.kind] - RISK[x.kind]).map((c) => (c.tokens?.length ? c.tokens : [c.name]).join(" ")))];
    const shown = names.slice(0, 3);
    return cap(humanPhrase(listJoin(shown)) + (names.length > 3 ? ` (+${names.length - 3} more)` : ""));
  }
  const phrases = [...tools].sort((x, y) => readRank(x) - readRank(y)).map(readPhrase); const shown = [...new Set(phrases)].slice(0, 3); const more = new Set(phrases).size - shown.length;
  return cap(humanPhrase(`${listJoin(shown)}${more > 0 ? ` (+${more} more)` : ""}`));
}
const bucketOf = (c) => c.kind === "auth" ? "auth" : c.kind === "navigate" ? "navigate" : c.kind === "view" ? "view" : c.kind === "spend" ? "spend" : RISK[c.kind] >= RISK.change ? "act" : c.signIn ? "account" : "public";
const BUCKET_ORDER = ["public", "navigate", "view", "account", "act", "spend", "auth"];
const LABEL_RANK = { safe: 0, "changes the view": 1, "needs sign-in": 2, "changes data": 3, "spends money": 4 };
const RISKY_LABELS = new Set(["changes data", "spends money"]);

function splitBucket(tools, max = 6) {
  if (tools.length <= max) return [tools];
  const byTopic = new Map();
  for (const c of tools) { const topic = singular(nounOf(c).split(" ").at(-1)); if (!byTopic.has(topic)) byTopic.set(topic, []); byTopic.get(topic).push(c); }
  const groups = [], rest = [];
  for (const g of byTopic.values()) (g.length > 1 ? groups : rest).push(...(g.length > 1 ? [g] : g));
  if (rest.length) groups.push(rest);
  return groups;
}

function shellQuote(s) { return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`; }
const scalarType = (spec = {}) => {
  const type = schemaType(spec);
  if (type === "object" || type === "array") return false;
  return ["string", "number", "integer", "boolean"].includes(type) || spec.example !== undefined || spec.examples?.length || spec.default !== undefined || spec.enum?.length;
};
const schemaType = (spec = {}) => {
  const declared = Array.isArray(spec.type) ? spec.type.find((x) => x !== "null") : spec.type;
  if (declared) return declared;
  if (spec.properties || spec.oneOf || spec.anyOf) return "object";
  if (spec.items) return "array";
  return declared;
};
function exampleForSpec(spec = {}, key = "value") {
  const type = schemaType(spec);
  const explicit = [spec.example, spec.examples?.[0], spec.default, spec.enum?.[0]].find((value) => value !== undefined);
  const emptyContainer = (type === "object" && explicit && typeof explicit === "object" && !Array.isArray(explicit) && !Object.keys(explicit).length) || (type === "array" && Array.isArray(explicit) && !explicit.length);
  if (explicit !== undefined && !emptyContainer) return explicit;
  if (type === "object") {
    const props = spec.properties ?? {};
    const required = new Set(spec.required ?? []);
    const entries = Object.entries(props).filter(([, child]) => scalarType(child));
    const chosen = entries.filter(([name]) => required.has(name));
    const usable = chosen.length ? chosen : entries.slice(0, 1);
    if (!usable.length) {
      const branch = spec.oneOf?.[0] ?? spec.anyOf?.[0];
      if (branch) return exampleForSpec(branch, key);
      return `<${key} JSON>`;
    }
    return Object.fromEntries(usable.map(([name, child]) => [name, exampleForSpec(child, name)]));
  }
  if (type === "array") {
    if (!spec.items || !scalarType(spec.items) && schemaType(spec.items) !== "object" && schemaType(spec.items) !== "array") return `<${key} JSON>`;
    return [exampleForSpec(spec.items, `${key} item`)];
  }
  return type === "string" || !type ? `<${key}>` : exampleValue(spec);
}
export function exampleCommand(c, tool, { cli = "secret-menu", tabId } = {}) {
  const schema = parseSchema(tool?.inputSchema);
  const parts = [cli, "call", c.name];
  if (tabId != null) parts.push("--tab", String(tabId));
  for (const key of c.required) {
    const spec = schema.properties?.[key] ?? {};
    const value = exampleForSpec(spec, key);
    parts.push("--arg", shellQuote(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`));
  }
  return parts.join(" ");
}
function pickExample(bucket, tools) {
  if (bucket === "act") { const C = { high: 0, medium: 1, low: 2 }; return [...tools].sort((x, y) => RISK[x.kind] - RISK[y.kind] || C[x.confidence] - C[y.confidence])[0]; }
  if (bucket === "auth") return tools.find((c) => /request|signin|login|authenticate/.test(c.tokens.join(" ")) && !c.tokens.includes("logout") && !c.tokens.includes("verify")) ?? tools.find((c) => !c.tokens.includes("logout") && !c.tokens.includes("signout")) ?? tools[0];
  return tools.find((c) => ["search", "find", "lookup", "quote"].includes(c.verb)) ?? tools.find((c) => c.required.length === 0) ?? tools[0];
}
function promptFor(bucket, title, tools, host) {
  const names = [...tools].sort((x, y) => readRank(x) - readRank(y)).map((c) => c.name).join(", ");
  const base = `On ${host}, ${title.charAt(0).toLowerCase()}${title.slice(1)}${bucket === "public" && tools.some((c) => c.required.length) ? " for <what you are looking for>" : ""}. Use the page's WebMCP tools through Secret Menu (${names}).`;
  if (bucket === "act" || bucket === "spend") { const riskiest = [...tools].sort((x, y) => RISK[y.kind] - RISK[x.kind])[0]; return `${base} Before calling anything, show me exactly what will ${bucket === "spend" ? "be charged" : "change"} and wait for my yes; never call ${riskiest.name} without it. Stop before confirming.`; }
  if (bucket === "auth") return `${base} Ask me for any code or password; never guess one. Stop before confirming.`;
  if (bucket === "view") return `${base} This only changes what the page shows.`;
  if (bucket === "account") return `${base} I'm signed in in the Secret Menu Chrome; only read, don't change anything.`;
  return `${base} These only read data.`;
}

export function explainTools(tools, { url = "", tabId, title, cli = "secret-menu", policySite = null, probes = {}, waitedMs, summarize, page = null, now = Date.now() } = {}) {
  let host = "", origin = "";
  try { const u = new URL(url); host = u.host; origin = u.origin; } catch {}
  const strip = sharedPrefix((tools ?? []).map((t) => t.name));
  const classified = (tools ?? []).map((t) => {
    const c = classifyTool(t, { strip });
    const p = probes[t.name];
    if (p && c.kind === "read") { c.probe = p.outcome; if (p.outcome === "needs sign-in") { c.signIn = true; c.signInSource = "probe"; c.signInConfidence = "high"; c.label = "needs sign-in"; } else if (p.outcome === "worked") { c.notes.push("probe: worked in this session"); } else c.notes.push(`probe: ${p.outcome}`); }
    c.onAllowlist = Boolean(policySite?.allow?.includes(t.name));
    return c;
  }).sort((x, y) => x.name.localeCompare(y.name));
  const byName = new Map((tools ?? []).map((t) => [t.name, t]));
  const n = (l) => classified.filter((c) => c.label === l).length;
  const counts = { tools: classified.length, safe: n("safe"), view: n("changes the view"), signIn: n("needs sign-in"), changes: n("changes data"), spends: n("spends money") };
  const header = counts.tools
    ? `This site has WebMCP: ${counts.tools} tool${counts.tools === 1 ? "" : "s"}: ${[`${counts.safe} safe`, counts.view && `${counts.view} change${counts.view === 1 ? "s" : ""} the view`, `${counts.signIn} need${counts.signIn === 1 ? "s" : ""} sign-in`, `${counts.changes} change${counts.changes === 1 ? "s" : ""} data`, `${counts.spends} spend${counts.spends === 1 ? "s" : ""} money`].filter(Boolean).join(", ")}`
    : `No WebMCP tools on this page${waitedMs != null ? ` (waited ${(waitedMs / 1000).toFixed(1)} s for tools to register)` : ""}. Either the site has none, or it adds them only after you sign in or open another page.`;
  const abilities = [];
  for (const bucket of BUCKET_ORDER) {
    const members = classified.filter((c) => bucketOf(c) === bucket);
    if (!members.length) continue;
    for (const group of splitBucket(members)) {
      const titleText = group.length === 1 && !["public", "account"].includes(bucket) ? cap(humanPhrase(group[0].tokens.join(" "))) : titleFor(bucket, group);
      const label = group.reduce((l, c) => LABEL_RANK[c.label] > LABEL_RANK[l] ? c.label : l, "safe");
      const ex = pickExample(bucket, group);
      const hinted = group.filter((c) => c.source === "hint").length;
      const labelFrom = hinted === group.length ? "from site hint" : hinted === 0 ? "guessed" : `mixed: ${hinted} from site hint, ${group.length - hinted} guessed`;
      const command = RISKY_LABELS.has(label) || bucket === "auth" ? null : exampleCommand(ex, byName.get(ex.name), { cli, tabId });
      abilities.push({ title: titleText, label, labelFrom, toolNames: group.map((c) => c.name), bucket, tools: group.map(({ tokens, verb, description, properties, ...rest }) => ({ ...rest, description: shortText(description), inputs: properties, hints: hintsOf(byName.get(rest.name)) })), example: { command, prompt: promptFor(bucket, titleText, group, host || "this site") } });
    }
  }
  const report = { schema: "secret-menu.explain/v1", generatedBy: "rules", verifiedAt: new Date(now).toISOString(), indexKey: origin || null, toolsDigest: toolsDigest(tools), header, url, origin, title, tabId, waitedMs, page: page ?? normalizePageContext(null, { title, url }), prefixStripped: strip, counts, abilities, calledPageTools: Object.values(probes).filter((p) => p.called).length, summary: null };
  if (typeof summarize === "function") report.summary = summarize(report) ?? null;
  return report;
}

export function renderExplain(r, { verbose = true } = {}) {
  const lines = [r.header];
  if (r.url) lines.push(`${r.url}${r.tabId != null ? ` (tab ${r.tabId})` : ""}`);
  const about = pageLine(r.page); if (about) lines.push(`About: ${about}`);
  r.abilities.forEach((ab, i) => {
    lines.push("", `${i + 1}. ${ab.title}  [${ab.label} · ${ab.labelFrom}]`, `   Tools: ${ab.toolNames.join(", ")}`);
    if (verbose) for (const t of ab.tools) {
      const how = t.source === "hint" ? "from site hint" : `guessed, ${t.confidence} confidence`;
      const sign = t.signIn ? ` · needs sign-in (${t.signInSource === "probe" ? "probe" : t.signInSource === "description" ? "says so" : "guess"})` : "";
      lines.push(`   - ${t.name}: ${KIND_TEXT[t.kind]} (${how})${sign}${t.onAllowlist ? " · on your allowlist" : ""}${t.notes.length ? ` · ${t.notes.join("; ")}` : ""}`);
    }
    if (ab.example.command) lines.push(`   Try: ${ab.example.command}`);
    lines.push(`   Ask an agent: "${ab.example.prompt}"`);
  });
  if (r.abilities.length) lines.push("", `Labels: "from site hint" means the page's own annotations say so; "guessed" means Secret Menu inferred it from names, descriptions and inputs. Tool names are exactly what the page registered. ${r.calledPageTools ? `Probed ${r.calledPageTools} read-only tool(s).` : "No page tools were called."}`);
  if (r.summary) lines.push("", r.summary);
  return lines.join("\n");
}

// Stable fingerprint of the tool surface (names, schemas, hints) so a cached index entry can tell when the site changed.
export function toolsDigest(tools) {
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
  const body = JSON.stringify(canon((tools ?? []).map((t) => ({ name: t.name, inputSchema: parseSchema(t.inputSchema), annotations: t.annotations ?? {} })).sort((a, b) => a.name.localeCompare(b.name))));
  return `sha256:${createHash("sha256").update(body).digest("hex").slice(0, 16)}`;
}

// Tools that --seed-allowlist may add: read-only by hint, or a read guess of medium/high confidence.
export function seedCandidates(report) {
  const add = [], skip = [], already = [];
  for (const t of report.abilities.flatMap((a) => a.tools)) {
    if (t.kind !== "read") { skip.push({ name: t.name, why: t.kind === "navigate" ? "navigates, not a read" : t.label }); continue; }
    if (t.source !== "hint" && t.confidence === "low") { skip.push({ name: t.name, why: "read-only is only a low-confidence guess" }); continue; }
    if (t.notes.some((n) => /name suggests/.test(n))) { skip.push({ name: t.name, why: "hint and name disagree" }); continue; }
    (t.onAllowlist ? already : add).push(t.name);
  }
  return { add, already, skip };
}

import test from "node:test";
import assert from "node:assert/strict";
import { classifyTool, explainTools, exampleCommand, nameKind, renderExplain, seedCandidates, sharedPrefix } from "../lib/explain.mjs";
import { normalizePageContext, pageLine } from "../lib/page-context.mjs";

const obj = (properties = {}, required = []) => ({ type: "object", properties, required });
const T = (name, description = "", annotations = {}, inputSchema = obj()) => ({ name, description, annotations, inputSchema });
// shaped like a number-shop site; no hints, as many real sites ship today
const shop = [
  T("search_numbers", "Search vanity phone numbers that spell a keyword. Public, no login.", {}, obj({ keyword: { type: "string" } }, ["keyword"])),
  T("get_quote", "Price a specific number before buying. Public. Returns the quote_token that purchase_number requires.", {}, obj({ e164: { type: "string" } }, ["e164"])),
  T("get_plan_info", "Plan pricing and cancellation policy. Public."),
  T("get_account_status", "Requires login. Card on file and renewal dates."),
  T("list_numbers", "Requires login. Your numbers with status."),
  T("list_invoices", "Requires login. Charges and their status."),
  T("purchase_number", "SENSITIVE: charges the customer. Requires login and confirm true.", {}, obj({ e164: { type: "string" }, confirm: { type: "boolean" }, total_cents: { type: "integer" } }, ["e164", "confirm"])),
  T("cancel_number", "SENSITIVE: cancel a number. Requires login and confirm true.", {}, obj({ id: { type: "string" }, confirm: { type: "boolean" } }, ["id", "confirm"])),
  T("set_forwarding", "Requires login. Set where calls ring.", {}, obj({ id: { type: "string" } }, ["id"])),
  T("request_login_code", "Send a 6-digit login code.", {}, obj({ email: { type: "string" } }, ["email"])),
  T("logout", "Log the customer out."),
];

test("name verbs map to kinds, including verbs that are not first", () => {
  assert.equal(nameKind("search_numbers").kind, "read");
  assert.equal(nameKind("purchaseNumber").kind, "spend");
  assert.equal(nameKind("number_purchase").kind, "spend");
  assert.equal(nameKind("cancel_number").kind, "destroy");
  assert.equal(nameKind("set_forwarding").kind, "change");
  assert.equal(nameKind("log_in").kind, "auth");
  assert.equal(nameKind("verify_login_code").kind, "auth");
  assert.equal(nameKind("open_dashboard").kind, "navigate");
  assert.equal(nameKind("frobnicate").kind, "unknown");
});

test("hints win over guesses and are reported as hints", () => {
  const ro = classifyTool(T("frobnicate", "", { readOnlyHint: true }));
  assert.deepEqual([ro.kind, ro.label, ro.source, ro.confidence], ["read", "safe", "hint", "high"]);
  const cons = classifyTool(T("place_order", "", { readOnlyHint: false, consequentialHint: true }));
  assert.deepEqual([cons.kind, cons.label, cons.source], ["spend", "spends money", "hint"]);
  const conflict = classifyTool(T("delete_everything", "", { readOnlyHint: true }));
  assert.equal(conflict.confidence, "medium");
  assert.match(conflict.notes.join(), /name suggests/);
  const untrusted = classifyTool(T("fetch_reviews", "", { readOnlyHint: true, untrustedContentHint: true }));
  assert.match(untrusted.notes.join(), /untrusted content/);
});

test("guesses: read names with spend inputs, unknown names, and sign-in wording", () => {
  const gift = classifyTool(T("get_gift_card", "Issue a gift card.", {}, obj({ amount: { type: "integer" }, confirm: { type: "boolean" } })));
  assert.deepEqual([gift.kind, gift.label, gift.confidence], ["spend", "spends money", "low"]);
  const unknown = classifyTool(T("frobnicate", "Does the thing."));
  assert.deepEqual([unknown.kind, unknown.source, unknown.confidence], ["change", "guess", "low"]);
  const acct = classifyTool(T("list_numbers", "Requires login. Your numbers."));
  assert.deepEqual([acct.label, acct.signIn, acct.signInSource], ["needs sign-in", true, "description"]);
  const pub = classifyTool(T("get_my_plan", "Public plan info."));
  assert.equal(pub.signIn, false);
  const named = classifyTool(T("get_my_orders", ""));
  assert.deepEqual([named.signIn, named.signInSource, named.signInConfidence], [true, "guess", "low"]);
});

test("ability titles humanize acronyms and preserve singular account nouns", () => {
  const profile = explainTools([T("get_ucp_profile", "Your profile.", { readOnlyHint: true })], { url: "https://account.example/" });
  assert.equal(profile.abilities[0].title, "See your UCP profile");
  const faqs = explainTools([T("list_faqs", "Frequently asked questions.", { readOnlyHint: true })], { url: "https://help.example/" });
  assert.match(faqs.abilities[0].title, /FAQs/);
  const order = explainTools([T("get_order_by_id", "Order details.", { readOnlyHint: true })], { url: "https://shop.example/" });
  assert.match(order.abilities[0].title, /ID/);
});

test("explainTools groups a shop into a few abilities with a header", () => {
  const r = explainTools(shop, { url: "https://numbers.example/app", tabId: 7, cli: "./bin/secret-menu" });
  assert.equal(r.header, "This site has WebMCP: 11 tools: 3 safe, 3 need sign-in, 4 change data, 1 spends money");
  assert.deepEqual(r.abilities.map((a) => [a.title, a.label]), [
    ["Search numbers, get a quote and see plan info", "safe"],
    ["See your account status, invoices and numbers", "needs sign-in"],
    ["Cancel number and set forwarding", "changes data"],
    ["Purchase number", "spends money"],
    ["Sign in or out", "changes data"],
  ]);
  assert.deepEqual(r.abilities[0].toolNames, ["get_plan_info", "get_quote", "search_numbers"]);
  assert.equal(r.abilities[0].labelFrom, "guessed");
  assert.equal(r.abilities[0].example.command, "./bin/secret-menu call search_numbers --tab 7 --arg 'keyword=<keyword>'");
  assert.match(r.abilities[3].example.prompt, /wait for my yes; never call purchase_number without it\. Stop before confirming\.$/);
  for (const i of [2, 3, 4]) assert.equal(r.abilities[i].example.command, null, "no runnable command for abilities that change or spend");
  assert.match(r.verifiedAt, /^\d{4}-\d\d-\d\dT/); assert.equal(r.indexKey, "https://numbers.example"); assert.match(r.toolsDigest, /^sha256:[0-9a-f]{16}$/);
  assert.equal(r.calledPageTools, 0);
  const text = renderExplain(r);
  assert.ok(text.startsWith(r.header));
  assert.match(text, /No page tools were called/);
  assert.match(text, /\[safe · guessed\]\n   Tools: get_plan_info, get_quote, search_numbers/);
  assert.doesNotMatch(text, /Try: .*purchase_number|Try: .*set_forwarding|Try: .*request_login_code/);
});

test("large read buckets split by topic", () => {
  const many = ["get_coin", "list_coins", "get_coin_price", "list_exchanges", "get_exchange", "search_markets", "get_market", "list_news"].map((n) => T(n, "Public."));
  const r = explainTools(many, { url: "https://coins.example/" });
  assert.ok(r.abilities.length >= 3, JSON.stringify(r.abilities.map((a) => a.title)));
  assert.equal(r.abilities.flatMap((a) => a.tools).length, many.length);
});

test("no tools gives a clear message", () => {
  const r = explainTools([], { url: "https://plain.example/", waitedMs: 10000 });
  assert.match(r.header, /^No WebMCP tools on this page \(waited 10\.0 s/);
  assert.deepEqual(r.abilities, []);
});

test("seed candidates take reads only, not low-confidence guesses or risky tools", () => {
  const tools = [...shop, T("get_gift_card", "Issue a gift card.", {}, obj({ amount: { type: "integer" } })), T("frobnicate_thing", "Does the thing."), T("check_ish", "Does the thing.", {}, obj({ confirm: { type: "boolean" } }))];
  const r = explainTools(tools, { url: "https://numbers.example/", policySite: { mode: "allowlist", allow: ["get_plan_info"] } });
  const seed = seedCandidates(r);
  assert.deepEqual(seed.add.sort(), ["get_account_status", "get_quote", "list_invoices", "list_numbers", "search_numbers"]);
  assert.deepEqual(seed.already, ["get_plan_info"]);
  for (const name of ["purchase_number", "cancel_number", "logout", "get_gift_card", "frobnicate_thing", "check_ish"]) assert.ok(seed.skip.some((s) => s.name === name), name);
});

test("probe results and the summary hook", () => {
  const tools = [T("get_wishlist", "Saved items.", { readOnlyHint: true })];
  const r = explainTools(tools, { url: "https://x.example/", probes: { get_wishlist: { outcome: "needs sign-in", called: true } }, summarize: (rep) => `summary of ${rep.counts.tools}` });
  assert.deepEqual([r.abilities[0].tools[0].label, r.abilities[0].tools[0].signInSource], ["needs sign-in", "probe"]);
  assert.equal(r.calledPageTools, 1);
  assert.equal(r.summary, "summary of 1");
});

test("example commands quote placeholders and use schema examples", () => {
  const tool = T("add_item", "", {}, obj({ item: { type: "string", enum: ["tea"] }, qty: { type: "integer" }, note: { type: "string" } }, ["item", "qty", "note"]));
  assert.equal(exampleCommand(classifyTool(tool), tool, { tabId: 3 }), "secret-menu call add_item --tab 3 --arg item=tea --arg qty=1 --arg 'note=<note>'");
});

test("example commands use the installed package command", () => {
  const tool = T("search_numbers", "Search numbers.", {}, obj({ keyword: { type: "string" } }, ["keyword"]));
  const classified = classifyTool(tool);
  assert.match(exampleCommand(classified, tool, { cli: "/tmp/node_modules/secret-menu/bin/secret-menu" }), /^secret-menu call/);
  assert.match(exampleCommand(classified, tool, { cli: "/tmp/_npx/abc/node_modules/secret-menu/bin/secret-menu" }), /^npx secret-menu call/);
});

test("example commands build useful JSON for object and array params", () => {
  const tool = T("show_variant", "", {}, obj({
    catalog: { type: "object", properties: { id: { type: "string" }, locale: { type: "string" } }, required: ["id"] },
    tags: { type: "array", items: { type: "string" } },
  }, ["catalog", "tags"]));
  assert.equal(exampleCommand(classifyTool(tool), tool), "secret-menu call show_variant --arg 'catalog={\"id\":\"<id>\"}' --arg 'tags=[\"<tags item>\"]'");
});

test("example commands use a readable placeholder for empty object schemas", () => {
  const tool = T("show_variant", "", {}, obj({ catalog: { type: "object", properties: {} } }, ["catalog"]));
  const command = exampleCommand(classifyTool(tool), tool);
  assert.equal(command, "secret-menu call show_variant --arg 'catalog=<catalog JSON>'");
  assert.doesNotMatch(command, /catalog=\{\}/);
});

test("example commands use the first oneOf object branch", () => {
  const tool = T("show_variant", "", {}, obj({ catalog: {
    type: "object",
    oneOf: [
      { type: "object", properties: { variant_id: { type: "string" } }, required: ["variant_id"] },
      { type: "object", properties: { selected_options: { type: "object" } }, required: ["selected_options"] },
    ],
  } }, ["catalog"]));
  assert.equal(exampleCommand(classifyTool(tool), tool), "secret-menu call show_variant --arg 'catalog={\"variant_id\":\"<variant_id>\"}'");
});

test("example commands infer untyped oneOf objects", () => {
  const tool = T("show_variant", "", {}, obj({ catalog: {
    oneOf: [
      { properties: { variant_id: { type: "string" } }, required: ["variant_id"] },
      { properties: { selected_options: { properties: {} } }, required: ["selected_options"] },
    ],
  } }, ["catalog"]));
  assert.equal(exampleCommand(classifyTool(tool), tool), "secret-menu call show_variant --arg 'catalog={\"variant_id\":\"<variant_id>\"}'");
});

test("a brand prefix shared by every tool is stripped before reading the verb", () => {
  const brand = [
    T("acme_chart_get_series", "", { readOnlyHint: true }),
    T("acme_chart_set_layout", "", { readOnlyHint: false }),
    T("acme_chart_save", "", { readOnlyHint: false }),
  ];
  assert.equal(sharedPrefix(brand.map((t) => t.name)), 2);
  assert.equal(sharedPrefix(["get_a", "get_b"]), 0, "never strips a verb");
  assert.equal(sharedPrefix(["solo_tool"]), 0);
  const r = explainTools(brand, { url: "https://acme.test/" });
  assert.equal(r.prefixStripped, 2);
  const titles = r.abilities.map((a) => a.title).join(" | ");
  assert.doesNotMatch(titles, /acme/i);
  assert.match(titles, /series/);
});

test("readOnlyHint:false on a view/open/copy tool reads as navigation, not a data change", () => {
  const tools = [T("site_view_docs", "", { readOnlyHint: false }), T("site_open_dashboard", "", { readOnlyHint: false }), T("site_publish_html", "", { readOnlyHint: false })];
  const r = explainTools(tools, { url: "https://site.test/" });
  const by = Object.fromEntries(r.abilities.flatMap((a) => a.tools).map((t) => [t.name, t]));
  assert.equal(by.site_view_docs.kind, "navigate");
  assert.equal(by.site_open_dashboard.kind, "navigate");
  assert.equal(by.site_publish_html.kind, "change");
  assert.equal(by.site_publish_html.label, "changes data");
  assert.equal(classifyTool(T("place_order", "", { readOnlyHint: false, consequentialHint: true })).kind, "spend");
});

test("page context is capped, redacted and part of the JSON report", () => {
  const page = normalizePageContext({ title: "Acme Numbers", description: "Write to sales@acme.test or call +1 415 555 0100. " + "x".repeat(400), og: { site_name: "Acme", image: "https://cdn/x.png" }, h1: ["Find a number", "", "b", "c", "d"], lang: "en" }, { url: "https://acme.test/" });
  assert.equal(page.source, "extension");
  assert.ok(page.description.length <= 300);
  assert.doesNotMatch(page.description, /sales@acme\.test|555 0100/);
  assert.deepEqual(Object.keys(page.og), ["site_name"]);
  assert.equal(page.h1.length, 3);
  assert.match(pageLine(page), /^Acme — Write to/);
  const r = explainTools([], { url: "https://acme.test/", title: "Acme", page });
  assert.equal(r.schema, "secret-menu.explain/v1");
  assert.equal(r.page.title, "Acme Numbers");
  assert.equal(JSON.parse(JSON.stringify(r)).page.og.site_name, "Acme");
  const fallback = explainTools([], { url: "https://acme.test/", title: "Acme" }).page;
  assert.equal(fallback.source, "tab");
  assert.match(fallback.note, /reload the Secret Menu extension/);
  assert.match(renderExplain(r), /About: Acme — /);
});

test("JSON tool entries keep description, inputs and hints for a later summary step", () => {
  const r = explainTools([T("site_get_item", "Item details. Contact help@site.test.", { readOnlyHint: true }, obj({ id: { type: "string" } }, ["id"])), T("site_compare", "", { readOnlyHint: false }), T("navigate-to", "", { readOnlyHint: false })], { url: "https://site.test/" });
  const t = r.abilities.flatMap((a) => a.tools).find((x) => x.name === "site_get_item");
  assert.deepEqual(t.inputs, ["id"]);
  assert.deepEqual(t.hints, { readOnlyHint: true });
  assert.doesNotMatch(t.description, /help@site\.test/);
  const titles = r.abilities.map((a) => a.title);
  for (const title of titles) assert.doesNotMatch(title, /\b(\w+) \1\b|^Use |: to$/i, title);
});

test("view-only changes, data changes and spending are separate labels", () => {
  const tools = [T("set-date-range", "Set the date range shown."), T("set-theme", "Switch light or dark theme."), T("set-location", "Filter by country or region."), T("compare", "Compare two coins on the chart.", { readOnlyHint: false }), T("add_to_cart", "Add a product variant to the cart."), T("checkout", "Start checkout and pay for the cart.")];
  const r = explainTools(tools, { url: "https://shop.example/" });
  const by = Object.fromEntries(r.abilities.flatMap((a) => a.tools).map((t) => [t.name, t.label]));
  assert.deepEqual(by, { "add_to_cart": "changes data", checkout: "spends money", compare: "changes the view", "set-date-range": "changes the view", "set-location": "changes the view", "set-theme": "changes the view" });
  assert.equal(r.counts.view, 4); assert.equal(r.counts.spends, 1);
  assert.ok(r.abilities.find((a) => a.label === "changes the view").example.command, "view changes keep a runnable example");
});

test("a read-sounding tool the site leaves non-read-only is a guess, never 'from site hint'", () => {
  const r = explainTools([
    { name: "get_product", description: "Get a product", annotations: { readOnlyHint: false } },
    { name: "show_variant", description: "Show a variant", annotations: { readOnlyHint: false } },
    { name: "add_to_cart", description: "Add to cart", annotations: { readOnlyHint: false } },
  ], { url: "https://shop.example/" });
  for (const ab of r.abilities) for (const t of ab.tools) if (t.name !== "add_to_cart") assert.equal(t.source, "guess", t.name);
  const cart = r.abilities.find((ab) => ab.toolNames.includes("add_to_cart"));
  assert.equal(cart.label, "changes data"); assert.equal(cart.labelFrom, "from site hint"); assert.equal(cart.example.command, null);
});

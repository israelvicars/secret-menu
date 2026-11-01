// Pinned tool list for explain.html (the deterministic test fixture). Imported by the page and by
// test/fixture-expected.test.mjs, which checks it against explain-expected.json. Change both together.
const signedIn = () => localStorage.getItem("explain_user") === "demo";
const object = (properties = {}, required = []) => ({ type: "object", properties, required });
const ok = (x) => async () => x;
export const tools = [
  // labeled read-only
  { name: "get_product", description: "Read one product by id.", inputSchema: object({ id: { type: "string", description: "Product id" } }, ["id"]), annotations: { readOnlyHint: true }, execute: ok({ id: "p1", name: "Tea" }) },
  { name: "fetch_reviews", description: "Customer reviews for a product (user-written text).", inputSchema: object({ id: { type: "string" } }, ["id"]), annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: ok({ reviews: [] }) },
  { name: "get_wishlist", description: "Your saved items.", inputSchema: object(), annotations: { readOnlyHint: true }, execute: async () => signedIn() ? { items: ["tea"] } : { ok: false, error: "login_required" } },
  // unlabeled reads
  { name: "search_products", description: "Search the catalog by keyword. Public, no login.", inputSchema: object({ q: { type: "string", description: "Keyword" } }, ["q"]), execute: ok({ results: [] }) },
  { name: "get_store_hours", description: "Hours.", inputSchema: object(), execute: ok({ open: "9-5" }) },
  { name: "list_my_orders", description: "Requires sign-in. Past orders with status.", inputSchema: object(), execute: ok({ orders: [] }) },
  // unlabeled changes / spends
  { name: "update_profile", description: "Requires sign-in. Update the display name.", inputSchema: object({ display_name: { type: "string" } }, ["display_name"]), execute: ok({ ok: true }) },
  { name: "buy_now", description: "SENSITIVE: charges the card on file. Requires login and confirm true.", inputSchema: object({ product_id: { type: "string" }, confirm: { type: "boolean" } }, ["product_id", "confirm"]), execute: ok({ ok: false, error: "fixture never charges" }) },
  { name: "get_gift_card", description: "Issue a gift card.", inputSchema: object({ amount: { type: "integer" }, confirm: { type: "boolean" } }, ["amount", "confirm"]), execute: ok({ ok: false }) },
  { name: "open_help", description: "Navigate to the help page.", inputSchema: object(), execute: ok({ ok: true }) },
  { name: "frobnicate", description: "Does the thing.", inputSchema: object(), execute: ok({ ok: true }) },
  { name: "sign_in_demo", description: "Fake sign in for the demo shop.", inputSchema: object(), execute: async () => { localStorage.setItem("explain_user", "demo"); return { ok: true }; } },
  // labeled changes
  { name: "place_order", description: "Place the order in the cart.", inputSchema: object({ confirm: { type: "boolean" } }, ["confirm"]), annotations: { readOnlyHint: false, consequentialHint: true }, execute: ok({ ok: false }) },
  { name: "delete_account", description: "Permanently delete the account.", inputSchema: object({ confirm: { type: "boolean" } }, ["confirm"]), annotations: { readOnlyHint: false, destructiveHint: true }, execute: ok({ ok: false }) },
];

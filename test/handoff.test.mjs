import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffPlan, handoffPrompt } from "../lib/handoff.mjs";

const allbirds = [
  { title: "Search catalog", label: "safe", toolNames: ["search_catalog", "get_cart"] },
  { title: "Browse store", label: "changes the view", toolNames: ["browse_store"] },
  { title: "See your ucp profiles", label: "needs sign-in", toolNames: ["get_ucp_profile"] },
  { title: "Add to cart", label: "changes data", toolNames: ["add_to_cart"] },
  { title: "Proceed to checkout", label: "spends money", toolNames: ["proceed_to_checkout"] },
];

test("handoff plan: reads run, changes and spends are off by default", () => {
  const p = handoffPlan(allbirds);
  assert.deepEqual(p.run.map((t) => t.name), ["search_catalog", "get_cart", "browse_store", "get_ucp_profile"]);
  assert.deepEqual(p.ask, []);
  assert.deepEqual(p.never.map((t) => t.name), ["add_to_cart", "proceed_to_checkout"]);
  const q = handoffPlan(allbirds, { allowChanges: true });
  assert.deepEqual(q.ask.map((t) => t.name), ["add_to_cart"]);
  assert.deepEqual(q.never.map((t) => t.name), ["proceed_to_checkout"]);
});

test("handoff prompt uses real tool names and never allows checkout unless asked", () => {
  const s = handoffPrompt({ host: "www.allbirds.com", task: "find men's running shoes under $120 in size 10 and add the best one to my cart.", abilities: allbirds, allowChanges: true });
  assert.equal(s, "On allbirds.com, find men's running shoes under $120 in size 10 and add the best one to my cart. Use the page's WebMCP tools through Secret Menu: search_catalog, get_cart, browse_store and get_ucp_profile to look (these only read or change the view), then add_to_cart. Before calling add_to_cart, show me exactly what will change and wait for my yes. Never call proceed_to_checkout. If a tool needs sign-in, ask me to sign in in the Secret Menu Chrome; never ask for my password. Stop before confirming.");
  assert.match(handoffPrompt({ host: "a.com", abilities: allbirds }), /^On a\.com, <what you want done>\./);
  assert.match(handoffPrompt({ host: "a.com", abilities: allbirds, allowSpends: true }), /show me exactly what will change or be charged/);
  assert.match(handoffPrompt({ host: "a.com", abilities: [] }), /no WebMCP tools you have allowed/);
});

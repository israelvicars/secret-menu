import test from "node:test";
import assert from "node:assert/strict";
import { shortTitle } from "../ext/src/lib/short-title.ts";

const ab = (title, count) => ({ title, toolNames: Array.from({ length: count }, (_, i) => `tool${i}`) });

test("shortTitle keeps single-tool titles and shortens tool lists", () => {
  assert.equal(shortTitle(ab("Search products, see product and see store hours (+2 more)", 5)), "Search products +4");
  assert.equal(shortTitle(ab("Delete account, frobnicate and update profile", 3)), "Delete account +2");
  assert.equal(shortTitle(ab("Buy now, get gift card and place order", 3)), "Buy now +2");
  assert.equal(shortTitle(ab("Search shop policies and faqs and get product", 2)), "Search shop policies and faqs +1");
  assert.equal(shortTitle(ab("Sign in or out", 2)), "Sign in or out");
  assert.equal(shortTitle(ab("Sign-in demo", 1)), "Sign-in demo");
  assert.equal(shortTitle(ab("Open pages: help, cart and search (and move around the site)", 3)), "Open help +2");
});

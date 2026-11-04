import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Public key from the original extension/manifest.json. It pins the extension ID
// (jfeobmnppdjonobichecmfkabddogeim, see EXTENSION_ID) that the native messaging host allows.
const KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8sUmpKUL9MRUJjGE9oOl+wjTyyeuSgc5GRL/2hPMTHufQLUMYScDAOgfxSpIeJmJmi3gzGeeYs5bnezQQAW0l7rHgTrfp3Rjcaz1sukbF1jze25wDTHQrsRg+XXa2jJuBpszX+ICUwh95LTKw6Z8ZqEMa3diUJNmYlZ1bMX0wrLNzff647X5T/LIWBEr/egmF9ohLz8bHKUlQa8WAfR5j2cK62PxUm0YpejxATDJvwuU+fASB3Gu3fIJRPbQ8cHzyDCtkHGMiBHAUI8he01m/WnlcK8sr2QehLZ1LZFTAMBlrPub+8rzj/tp5qtcRvUsPGmAdOWu8Tub3KWMMFC26wIDAQAB";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  browser: "chrome",
  manifest: {
    name: "Secret Menu for WebMCP",
    description: "Secret Menu for WebMCP connects you and your agent to tools across sites. Discover a page's abilities, hand them to your agent.",
    minimum_chrome_version: "155",
    key: KEY,
    permissions: ["nativeMessaging", "tabs", "scripting", "storage"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Secret Menu" },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // lib/explain.mjs and lib/core.mjs import node:crypto for sha256 digests; the popup runs them in the browser.
        "node:crypto": fileURLToPath(new URL("./src/shims/node-crypto.ts", import.meta.url)),
      },
    },
  }),
});

import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { buildManifest, isStoreBuild } from "./manifest.config.mjs";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  browser: "chrome",
  manifest: buildManifest({ store: isStoreBuild() }),
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

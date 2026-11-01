import { startContent } from "@/bridge/content.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    startContent();
  },
});

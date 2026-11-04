// Lets extension pages (the popup now; side panel and directory later) read a tab's tools through
// the same handle("list_page_tools") path the CLI and MCP use. Read-only by construction: only the
// methods below are answered, so no extension page can call, open or close anything through here.
export const POPUP_TARGET = "secret-menu-ui";
export const POPUP_METHODS = new Set(["list_page_tools", "index_list"]);

export function createPopupListener(handle, { extensionId } = {}) {
  return (msg, sender, reply) => {
    if (msg?.target !== POPUP_TARGET) return undefined;
    // Only our own extension pages (no tab, or a chrome-extension:// tab) may ask; never content scripts.
    if (extensionId && sender?.id !== extensionId) return undefined;
    if (sender?.url && !String(sender.url).startsWith("chrome-extension://")) return undefined;
    if (!POPUP_METHODS.has(msg.method)) {
      reply({ error: `Not allowed from extension pages: ${msg.method}` });
      return false;
    }
    Promise.resolve()
      .then(() => handle(msg.method, msg.params ?? {}))
      .then((result) => reply({ result }), (error) => {
        const response = { error: String(error?.message ?? error) };
        if (error?.webmcp) response.webmcp = error.webmcp;
        reply(response);
      });
    return true;
  };
}

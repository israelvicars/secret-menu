// Content script, moved unchanged from extension/content.js. Wrapped in startContent() so WXT can
// import it at build time without running it (body not re-indented on purpose).
export function startContent() {
  if (window.__secretMenuContent) return;
  window.__secretMenuContent = true;

  const MAX_RESULT_CHARS = 20000;
  let timer = null;
  let toolchangeEvents = 0;
  const installedListeners = new Set();

  const parseSchema = (schema) => {
    if (typeof schema !== "string") return schema ?? null;
    try { return JSON.parse(schema); } catch { return { raw: schema }; }
  };
  const plainTool = (tool) => ({
    name: tool.name,
    title: tool.title ?? null,
    description: tool.description ?? "",
    inputSchema: parseSchema(tool.inputSchema),
    annotations: {
      readOnlyHint: tool.annotations?.readOnlyHint ?? null,
      consequentialHint: tool.annotations?.consequentialHint ?? null,
      untrustedContentHint: tool.annotations?.untrustedContentHint ?? null,
    },
  });
  async function ownTools(modelContext) {
    return (await modelContext.getTools()).filter((tool) => !tool.window || tool.window === window);
  }
  function emitSnapshot(tools, via) {
    chrome.runtime.sendMessage({
      target: "secret-menu-background",
      type: "snapshot",
      tools,
      via,
      url: location.href,
      toolchangeEvents,
    }).catch(() => {});
  }

  async function poll(via = "poll") {
    const modelContext = document.modelContext;
    if (!modelContext) return;
    if (via === "toolchange") toolchangeEvents++;
    try {
      const tools = (await ownTools(modelContext)).map(plainTool);
      emitSnapshot(tools, via);
    } catch (error) {
      chrome.runtime.sendMessage({
        target: "secret-menu-background",
        type: "event",
        event: { kind: "error", error: String(error?.message ?? error), via },
      }).catch(() => {});
    }
  }

  async function startWatch() {
    const modelContext = document.modelContext;
    if (!modelContext) return { error: "WebMCP is not available on this page." };
    const probes = ["toolschange", "toolchange", "toolschanged"].map((name) => ({
      name,
      property: `on${name}` in modelContext,
      listener: false,
    }));
    for (const probe of probes) {
      if (!probe.property) continue;
      if (installedListeners.has(probe.name)) {
        probe.listener = true;
        continue;
      }
      try {
        modelContext.addEventListener(probe.name, () => poll(probe.name));
        installedListeners.add(probe.name);
        probe.listener = true;
      } catch {}
    }
    const tools = (await ownTools(modelContext)).map(plainTool);
    if (!timer) timer = setInterval(() => poll("poll"), 500);
    return {
      url: location.href,
      tools,
      toolchangeEvents,
      mechanism: { pollMs: 500, probes },
    };
  }

  // What the page says it is, for `secret-menu explain` (capped; no form values or body text).
  const pageContext = () => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute("content")?.slice(0, 500) ?? null;
    const og = {};
    for (const k of ["title", "description", "site_name", "type", "url"]) { const v = meta(`meta[property="og:${k}"]`); if (v) og[k] = v; }
    return {
      title: document.title.slice(0, 500),
      description: meta('meta[name="description"]'),
      og,
      h1: [...document.querySelectorAll("h1")].slice(0, 3).map((h) => h.textContent.trim().slice(0, 200)).filter(Boolean),
      lang: document.documentElement.lang || null,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      url: location.href,
    };
  };

  async function handle(msg) {
    const modelContext = document.modelContext;
    if (!modelContext) return { error: "WebMCP is not available on this page (document.modelContext is missing).", secureContext: window.isSecureContext, modelContext: false };
    if (msg.action === "LIST_TOOLS") {
      return { url: location.href, title: document.title, page: pageContext(), tools: (await ownTools(modelContext)).map(plainTool) };
    }
    if (msg.action === "WATCH_START") return startWatch();
    if (msg.action === "EXECUTE_TOOL") {
      const tool = (await ownTools(modelContext)).find((candidate) => candidate.name === msg.name);
      if (!tool) return { error: `Tool "${msg.name}" is not on this page.` };
      const raw = await modelContext.executeTool(tool, msg.args ?? {});
      let result = typeof raw === "string" ? raw : JSON.stringify(raw);
      if (result === undefined) result = String(raw);
      const truncated = result.length > MAX_RESULT_CHARS;
      return {
        url: location.href,
        tool: msg.name,
        result: truncated ? result.slice(0, MAX_RESULT_CHARS) : result,
        truncated,
      };
    }
    return { error: `Unknown action ${msg.action}` };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.target !== "secret-menu-content") return;
    handle(msg).then(reply, (error) => reply({ error: String(error?.message ?? error) }));
    return true;
  });

  chrome.runtime.sendMessage({
    target: "secret-menu-background",
    type: "doc_ready",
    timeOrigin: performance.timeOrigin,
  }).catch(() => {});
}

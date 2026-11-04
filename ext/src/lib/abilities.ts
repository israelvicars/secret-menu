// The popup's abilities list is exactly `secret-menu explain`: same tool list (handle("list_page_tools")),
// same rules (lib/explain.mjs), same labels. Nothing here re-labels or summarizes.
import { explainTools as explainToolsJs } from "../../../lib/explain.mjs";
import { normalizePageContext as normalizePageContextJs } from "../../../lib/page-context.mjs";
import { waitForTools as waitForToolsJs } from "../../../lib/wait.mjs";
import { POPUP_TARGET } from "@/bridge/popup-api.js";

// The shared libs are plain JS with defaulted options, so TS infers over-narrow types; loosen them here.
type Loose = (...args: any[]) => any;
const explainTools = explainToolsJs as Loose;
const normalizePageContext = normalizePageContextJs as Loose;
const waitForTools = waitForToolsJs as Loose;

export type Label = "safe" | "changes the view" | "needs sign-in" | "changes data" | "spends money";
export interface AbilityTool { name: string; kind: string; label: Label; source: "hint" | "guess"; confidence: string; signIn: boolean; notes: string[]; description: string }
export interface Ability { title: string; label: Label; labelFrom: string; toolNames: string[]; bucket: string; tools: AbilityTool[]; example: { command: string | null; prompt: string } }
export interface ExplainReport {
  header: string; url: string; origin: string; title?: string; tabId?: number; verifiedAt: string; toolsDigest: string;
  counts: { tools: number; safe: number; view: number; signIn: number; changes: number; spends: number };
  abilities: Ability[]; calledPageTools: number; page: { og?: { site_name?: string }; title?: string | null } | null;
}

type ListResult = { tabId: number; url: string; title?: string; page?: unknown; tools?: unknown[] };

async function listPageTools(tabId: number): Promise<ListResult> {
  const reply = await chrome.runtime.sendMessage({ target: POPUP_TARGET, method: "list_page_tools", params: { tabId } });
  if (!reply) throw new Error("The extension's background worker did not answer.");
  if (reply.error) {
    const error = new Error(reply.error) as Error & { webmcp?: unknown };
    if (reply.webmcp) error.webmcp = reply.webmcp;
    throw error;
  }
  return reply.result;
}

export const NO_WEBMCP = /WebMCP is not available/i;

// Tools can register a moment after load; wait briefly (short quiet window) if none are there yet.
export async function explainTab(tab: { id: number; url?: string; title?: string }): Promise<ExplainReport> {
  let data = await listPageTools(tab.id);
  let waitedMs: number | undefined;
  if (!data.tools?.length) {
    const waited = await waitForTools(async () => (data = await listPageTools(tab.id)).tools ?? [], { timeoutMs: 3000, settleMs: 500, pollMs: 250 });
    waitedMs = waited.waitedMs;
  }
  const t = { id: tab.id, url: data.url ?? tab.url, title: data.title ?? tab.title };
  return explainTools(data.tools ?? [], { url: t.url, tabId: t.id, title: t.title, cli: "secret-menu", waitedMs, page: normalizePageContext(data.page, t) });
}

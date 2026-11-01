import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Compass, Copy, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { LabelFrom, LabelPill } from "@/components/label-pill";
import { SiteIcon } from "@/components/site-icon";
import { explainTab, NO_WEBMCP, type Ability, type ExplainReport } from "@/lib/abilities";
import { bare, hostOf, isWeb, openExtensionPage } from "@/lib/pages";
import { cn } from "@/lib/utils";
import { ABILITIES_PAGE_TITLE, detailsId, MAIN_ID, MAIN_STATE_ID, PAGE_MAIN_LABEL, POPUP_MAIN_LABEL, stateName } from "@/lib/test-hooks";

type State =
  | { kind: "loading" }
  | { kind: "ready"; report: ExplainReport }
  | { kind: "empty"; host: string; reason: "no-webmcp" | "no-tools" | "not-web" }
  | { kind: "error"; message: string };

// Toolbar popup: the active tab. Opened as a page (badge fallback, screenshots, tests): ?tab=<id>.
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const param = new URLSearchParams(location.search).get("tab");
  if (param) return chrome.tabs.get(Number(param));
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}

export function Popup() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const asPage = new URLSearchParams(location.search).has("view");
  // Opened as a tab (badge fallback): a distinct window title so tests can tell it from the popup.
  useEffect(() => { if (asPage) document.title = ABILITIES_PAGE_TITLE; }, [asPage]);
  const name = stateName(state);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const t = await targetTab().catch(() => undefined);
    setTab(t);
    if (!t?.id || !isWeb(t.url)) return setState({ kind: "empty", host: "", reason: "not-web" });
    try {
      const report = await explainTab({ id: t.id, url: t.url, title: t.title });
      setState(report.counts.tools ? { kind: "ready", report } : { kind: "empty", host: hostOf(report.url), reason: "no-tools" });
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      setState(NO_WEBMCP.test(message) ? { kind: "empty", host: hostOf(t.url), reason: "no-webmcp" } : { kind: "error", message });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (path: string) => { await openExtensionPage(path, tab); if (!asPage) window.close(); };

  return (
    <div className={cn("flex max-h-[600px] w-[380px] flex-col", asPage && "mx-auto my-6 rounded-xl border")} data-testid="popup">
      <main id={MAIN_ID} data-state={name} aria-label={asPage ? PAGE_MAIN_LABEL : POPUP_MAIN_LABEL} aria-describedby={MAIN_STATE_ID} className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-3" aria-busy={state.kind === "loading"}>
        <span id={MAIN_STATE_ID} className="sr-only">State: {name}</span>
        {state.kind === "loading" && (
          <div role="status" aria-label="Loading: reading this page's WebMCP tools" data-state="loading" className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading this page's WebMCP tools…
          </div>
        )}
        {state.kind === "ready" && <Abilities report={state.report} favIconUrl={tab?.favIconUrl} onRecheck={load} />}
        {state.kind === "empty" && <Empty state={state} favIconUrl={tab?.favIconUrl} onRecheck={state.reason === "not-web" ? undefined : load} />}
        {state.kind === "error" && (
          <div role="status" aria-label="Error: couldn't read this page" data-state="error" className="py-6">
            <div className="font-semibold">Couldn't read this page</div>
            <div className="mt-1 text-xs text-muted-foreground" data-testid="error-detail">{state.message}</div>
            <RecheckButton onClick={load} className="mt-2" />
          </div>
        )}
      </main>
      <nav aria-label="Secret Menu pages" className="flex gap-1.5 border-t px-3.5 py-2">
        <Button size="xs" variant="outline" className="h-6 gap-1 px-2 text-[11px]" disabled={state.kind !== "ready"} onClick={() => open(`/handoff.html?tab=${tab?.id}`)} aria-label="Hand off to an agent">
          <Send className="size-3" aria-hidden="true" /> Hand off to an agent
        </Button>
        <Button size="xs" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={() => open("/discover.html")} aria-label="Discover sites">
          <Compass className="size-3" aria-hidden="true" /> Discover sites
        </Button>
      </nav>
      <footer className="flex items-center justify-between gap-2 border-t px-3.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Mark />Secret Menu</span>
        <ThemeToggle />
      </footer>
    </div>
  );
}

function RecheckButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button size="xs" variant="ghost" onClick={onClick} className={cn("h-6 gap-1 px-1.5 text-[11px] text-muted-foreground", className)} aria-label="Re-check this page's tools" title="Tools can load late; read them again">
      <RefreshCw className="size-3" aria-hidden="true" /> Re-check
    </Button>
  );
}

const COUNTS = [["safe", "safe", "safe"], ["view", "view", "changes the view"], ["signIn", "sign-in", "needs sign-in"], ["changes", "changes", "changes data"], ["spends", "spends", "spends money"]] as const;

function Abilities({ report, favIconUrl, onRecheck }: { report: ExplainReport; favIconUrl?: string; onRecheck: () => void }) {
  const host = hostOf(report.url);
  const c = report.counts;
  return (
    <section aria-label={`Abilities on ${bare(host)}`} data-state="ready">
      <header className="flex items-start gap-2.5 pb-2">
        <SiteIcon host={host} src={favIconUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">What more can I do here?</h1>
          <div className="truncate text-xs text-muted-foreground" data-testid="site-summary">{bare(host)} · {c.tools} WebMCP tool{c.tools === 1 ? "" : "s"}</div>
          <div className="mt-1 flex flex-wrap gap-1" aria-label="Tool counts by label">
            {COUNTS.filter(([k]) => c[k] > 0).map(([k, word, label]) => <LabelPill key={k} label={label}>{c[k]} {word}</LabelPill>)}
          </div>
        </div>
        <RecheckButton onClick={onRecheck} className="-mr-1.5" />
      </header>
      <ul className="divide-y border-t" aria-label="Abilities">
        {report.abilities.map((ab, i) => <AbilityRow key={`${ab.title}-${i}`} ab={ab} index={i} />)}
      </ul>
      <p className="py-2 text-[10.5px] leading-snug text-muted-foreground">
        <span className="text-from-hint">hint</span> = the page's own annotations; <span className="text-from-guess italic">guessed</span> = Secret Menu's rules; <span className="text-from-guess italic">mixed</span> = some of each.
        {" "}{report.calledPageTools ? `Probed ${report.calledPageTools} read-only tool(s).` : "No page tools were called."}
      </p>
    </section>
  );
}

function AbilityRow({ ab, index }: { ab: Ability; index: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelId = detailsId(index);
  const copy = async () => {
    await navigator.clipboard.writeText(ab.example.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <li aria-label={`Ability: ${ab.title}, ${ab.label}`} data-testid="ability-row" data-label={ab.label}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${open ? "Hide" : "Show"} details for ${ab.title}`}
        className="flex w-full items-center gap-1.5 rounded-sm py-1.5 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight aria-hidden="true" className={cn("size-3.5 flex-none text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug" title={ab.title}>{ab.title}</span>
        <LabelPill label={ab.label} />
        <LabelFrom from={ab.labelFrom} compact />
      </button>
      {open && (
        <div id={panelId} role="region" aria-label={`Details for ${ab.title}`} data-testid="ability-details" className="space-y-1.5 pb-2 pl-5">
          <div className="text-[11px] text-muted-foreground"><LabelFrom from={ab.labelFrom} /></div>
          <div className="flex flex-wrap gap-1" aria-label="Tool names">
            {ab.toolNames.map((name) => (
              <code key={name} className="rounded border bg-code px-1 py-px font-mono text-[11px] text-code-foreground">{name}</code>
            ))}
          </div>
          {ab.tools.some((t) => t.notes.length || t.source !== "hint") && (
            <ul className="space-y-0.5" aria-label="Notes">
              {ab.tools.map((t) => (
                <li key={t.name} className="text-[11px] leading-snug text-muted-foreground">
                  <span className="font-mono text-foreground">{t.name}</span>: {t.source === "hint" ? "from site hint" : `guessed, ${t.confidence} confidence`}
                  {t.notes.length ? ` · ${t.notes.join("; ")}` : ""}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-md border bg-code p-2 text-[11.5px] leading-snug" data-testid="agent-prompt">{ab.example.prompt}</div>
          <Button size="xs" variant="outline" onClick={copy} className="h-6 gap-1 px-2 text-[11px]" aria-label={`Copy agent prompt for ${ab.title}`}>
            {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />} {copied ? "Copied" : "Copy agent prompt"}
          </Button>
        </div>
      )}
    </li>
  );
}

const EMPTY = {
  "not-web": ["Not a web page", "Open a website to see what its WebMCP tools let you and your agent do.", "Empty state: not a web page"],
  "no-webmcp": ["No WebMCP here", "This page doesn't offer WebMCP tools (document.modelContext is missing). Most sites don't yet.", "Empty state: no WebMCP on this page"],
  "no-tools": ["No WebMCP tools on this page", "Checked for 3 seconds. The site may add tools after you sign in or open another page.", "Empty state: no WebMCP tools on this page"],
} as const;

function Empty({ state, favIconUrl, onRecheck }: { state: Extract<State, { kind: "empty" }>; favIconUrl?: string; onRecheck?: () => void }) {
  const [title, body, label] = EMPTY[state.reason];
  return (
    <div role="status" aria-label={label} data-state={`empty-${state.reason}`} className="flex items-start gap-2.5 py-4">
      <SiteIcon host={state.host || "·"} src={state.host ? favIconUrl : undefined} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {state.host && <div className="truncate text-xs text-muted-foreground">{bare(state.host)}</div>}
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{body}</p>
        {onRecheck && <RecheckButton onClick={onRecheck} className="mt-1 -ml-1.5" />}
      </div>
    </div>
  );
}

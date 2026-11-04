import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Compass, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyLabel } from "@/components/copy-label";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { LabelFrom, LabelPill } from "@/components/label-pill";
import { SiteIcon } from "@/components/site-icon";
import { explainTab, NO_WEBMCP, type Ability, type ExplainReport } from "@/lib/abilities";
import { bare, hostOf, isWeb, openExtensionPage } from "@/lib/pages";
import { cn } from "@/lib/utils";
import { shortTitle } from "@/lib/short-title";
import { countPills } from "@/lib/count-pills";
import { explainError } from "@/lib/error-copy";
import { hasMoreBelow } from "@/lib/scroll-cue";
import { countLabel } from "@/lib/plural";
import { ABILITIES_PAGE_TITLE, detailsId, MAIN_ID, MAIN_STATE_ID, PAGE_MAIN_LABEL, POPUP_MAIN_LABEL, stateName } from "@/lib/test-hooks";
import { noToolsReason, openWebmcpFlag, WEBMCP_FLAG_URL, type NoToolsReason } from "@/lib/webmcp-state";

type State =
  | { kind: "loading" }
  | { kind: "ready"; report: ExplainReport }
  | { kind: "empty"; host: string; reason: "not-web" | NoToolsReason }
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
  const [showLoading, setShowLoading] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  // Opened as a tab (badge fallback): a distinct window title so tests can tell it from the popup.
  useEffect(() => { if (asPage) document.title = ABILITIES_PAGE_TITLE; }, [asPage]);
  const name = stateName(state);

  useEffect(() => {
    if (state.kind !== "loading") { setShowLoading(false); return; }
    const timer = window.setTimeout(() => setShowLoading(true), 150);
    return () => window.clearTimeout(timer);
  }, [state.kind]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const update = () => setMoreBelow(hasMoreBelow(main.scrollTop, main.clientHeight, main.scrollHeight));
    update();
    main.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(main);
    if (contentRef.current) resizeObserver.observe(contentRef.current);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    return () => { main.removeEventListener("scroll", update); resizeObserver.disconnect(); mutationObserver.disconnect(); };
  }, [name, showLoading]);

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
      if (NO_WEBMCP.test(message)) {
        const webmcp = (error as Error & { webmcp?: { secureContext?: boolean; modelContext?: boolean } }).webmcp;
        setState({ kind: "empty", host: hostOf(t.url), reason: noToolsReason({ ...webmcp, url: t.url }) ?? "no-webmcp" });
      } else setState({ kind: "error", message });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (path: string) => { await openExtensionPage(path, tab); if (!asPage) window.close(); };

  return (
    <div className={cn("flex max-h-[600px] w-[380px] flex-col", asPage && "mx-auto my-6 rounded-xl border")} data-testid="popup">
      <div className="relative flex min-h-0 flex-1 flex-col">
      <main ref={mainRef} data-more-below={moreBelow ? "true" : "false"} id={MAIN_ID} data-state={name} aria-label={asPage ? PAGE_MAIN_LABEL : POPUP_MAIN_LABEL} aria-describedby={MAIN_STATE_ID} className="relative min-h-0 flex-1 overflow-y-auto px-3.5 pt-3 pb-2" aria-busy={state.kind === "loading"}>
        <span id={MAIN_STATE_ID} className="sr-only">State: {name}</span>
        <div ref={contentRef}>
          {state.kind === "loading" && <LoadingSkeleton hidden={!showLoading} />}
          {state.kind === "ready" && <Abilities report={state.report} favIconUrl={tab?.favIconUrl} onRecheck={load} />}
          {state.kind === "empty" && <Empty state={state} favIconUrl={tab?.favIconUrl} onRecheck={state.reason === "not-web" || state.reason === "insecure" ? undefined : load} onDiscover={() => open("/discover.html")} />}
          {state.kind === "error" && (
            <div role="status" aria-label="Error: couldn't read this page" data-state="error" className="flex items-start gap-2.5 py-4">
              {/* #22: same fixed mark as the empty states. */}
              <SiteIcon host="" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Couldn't read this page</div>
                <div className="mt-1 text-xs text-muted-foreground">{explainError(state.message).cause}</div>
                <RecheckButton onClick={load} className="mt-1 -ml-1.5" />
                <details className="mt-1.5 text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer">Details</summary>
                  <div className="mt-1 break-all font-mono" data-testid="error-detail">{state.message}</div>
                </details>
              </div>
            </div>
          )}
        </div>
      </main>
        {moreBelow && <div aria-hidden="true" data-testid="scroll-cue" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background via-background/80 to-transparent" />}
      </div>
      <nav aria-label="Secret Menu pages" className={cn("relative flex gap-1.5 border-t px-3.5 py-2", moreBelow && "shadow-[0_-6px_8px_-6px_rgb(0_0_0/0.25)] dark:shadow-[0_-6px_8px_-6px_rgb(0_0_0/0.7)]")}>
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

// Same boxes as the ready view (header, count row, rows, read line) so the popup does not jump when tools arrive.
// The first 150 ms render it invisible, keeping the height without a flash.
const SKELETON_ROWS = 6;
function LoadingSkeleton({ hidden = false }: { hidden?: boolean }) {
  const bone = "rounded bg-muted animate-pulse motion-reduce:animate-none";
  return (
    <div role="status" aria-label="Loading: reading this page's WebMCP tools" data-state="loading" className={cn(hidden && "invisible")}>
      <span className="sr-only">Reading this page's WebMCP tools…</span>
      <div className="flex items-start gap-2.5 pb-2"><div className={cn("size-9 flex-none rounded-lg", bone)} /><div className="min-w-0 flex-1 space-y-1.5 pt-0.5"><div className={cn("h-3.5 w-40", bone)} /><div className={cn("h-3 w-28", bone)} /></div></div>
      <div className="mb-2 flex gap-1">{[12, 20, 22, 20].map((w, i) => <div key={i} className={cn("h-4", bone)} style={{ width: `${w * 4}px` }} />)}</div>
      <ul className="divide-y border-t">{Array.from({ length: SKELETON_ROWS }, (_, i) => <li key={i} className="flex items-center gap-1.5 py-1.5"><div className={cn("h-[18px] flex-1", bone)} /></li>)}</ul>
      <div className="py-2"><div className={cn("h-3 w-36", bone)} /></div>
    </div>
  );
}

function Abilities({ report, favIconUrl, onRecheck }: { report: ExplainReport; favIconUrl?: string; onRecheck: () => void }) {
  const host = hostOf(report.url);
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set());
  const onToggle = useCallback((index: number, isOpen: boolean) => setOpenRows((prev) => { const next = new Set(prev); if (isOpen) next.add(index); else next.delete(index); return next; }), []);
  const c = report.counts;
  return (
    <section aria-label={`Abilities on ${bare(host)}`} data-state="ready">
      <header className="flex items-start gap-2.5 pb-2">
        <SiteIcon host={host} src={favIconUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">What more can I do here?</h1>
          <div className="truncate text-xs text-muted-foreground" data-testid="site-summary">{bare(host)} · {countLabel(c.tools, "WebMCP tool")}</div>
        </div>
        <RecheckButton onClick={onRecheck} className="-mr-1.5" />
      </header>
      <div className="mb-2 flex w-full flex-nowrap gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Tool counts by label">
        {countPills(c).map(({ label, text }) => <LabelPill key={label} label={label} className="h-4 flex-none px-1 text-[10px]">{text}</LabelPill>)}
      </div>
      <ul className="divide-y border-t" aria-label="Abilities">
        {report.abilities.map((ab, i) => <AbilityRow key={`${ab.title}-${i}`} ab={ab} index={i} onToggle={onToggle} />)}
      </ul>
      <p className="py-2 text-[10.5px] leading-snug text-muted-foreground" data-testid="read-note">
        {openRows.size > 0 && <span data-testid="label-legend"><span>hint</span> = the page's own annotations; <span>guessed</span> = Secret Menu's rules; <span>mixed</span> = some of each.{" "}</span>}
        {report.calledPageTools ? `Probed ${report.calledPageTools} read-only tool(s).` : "No page tools were called."}
      </p>
    </section>
  );
}

function AbilityRow({ ab, index, onToggle }: { ab: Ability; index: number; onToggle?: (index: number, open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onToggle?.(index, open); }, [index, open, onToggle]);
  const [copied, setCopied] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = detailsId(index);
  useEffect(() => {
    if (!open || !detailsRef.current) return;
    const details = detailsRef.current;
    const main = details.closest("main");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tooTall = !!main && details.getBoundingClientRect().height > main.clientHeight;
    (tooTall ? buttonRef.current : details)?.scrollIntoView({ block: tooTall ? "start" : "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [open]);
  const copy = async () => {
    await navigator.clipboard.writeText(ab.example.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <li aria-label={`Ability: ${ab.title}, ${ab.label}`} data-testid="ability-row" data-label={ab.label}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${open ? "Hide" : "Show"} details for ${ab.title}`}
        className="flex w-full items-start gap-1.5 rounded-sm py-1.5 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {/* #25: chevron and pill sit on the first title line (offset = (line-height - size) / 2), not the row middle. */}
        <ChevronRight aria-hidden="true" data-testid="row-chevron" className={cn("mt-[calc((13px*1.375-0.875rem)/2)] size-3.5 flex-none text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug [overflow-wrap:anywhere]" title={ab.title} data-testid="ability-title">{shortTitle(ab)}</span>
        <LabelPill label={ab.label} className="flex-none" />
      </button>
      {open && (
        <div ref={detailsRef} id={panelId} role="region" aria-label={`Details for ${ab.title}`} data-testid="ability-details" className="min-w-0 space-y-1.5 pb-2 pl-5">
          <p className="min-w-0 max-w-full text-[11px] font-normal leading-snug text-foreground [overflow-wrap:anywhere]">{ab.title}</p>
          <div className="text-[11px] text-muted-foreground"><LabelFrom from={ab.labelFrom} /></div>
          <div className="flex flex-wrap gap-1" aria-label="Tool names">
            {ab.toolNames.map((name) => (
              <code key={name} title={name} className="block max-w-full break-all rounded border bg-code px-1 py-px font-mono text-[11px] text-code-foreground">{name}</code>
            ))}
          </div>
          {ab.tools.some((t) => t.notes.length || t.source !== "hint") && (
            <ul className="space-y-0.5" aria-label="Notes">
              {ab.tools.map((t) => (
                <li key={t.name} className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                  <span title={t.name} className="break-all font-mono text-foreground">{t.name}</span>: {t.source === "hint" ? "from site hint" : `guessed, ${t.confidence} confidence`}
                  {t.notes.length ? ` · ${t.notes.join("; ")}` : ""}
                </li>
              ))}
            </ul>
          )}
          <div className="min-w-0 max-w-full whitespace-pre-wrap rounded-md border bg-code p-2 text-[11.5px] leading-snug [overflow-wrap:anywhere]" data-testid="agent-prompt">{ab.example.prompt}</div>
          <Button size="xs" variant="outline" onClick={copy} className="h-6 gap-1 px-2 text-[11px]" aria-label={`Copy agent prompt for ${ab.title}`}>
            <CopyLabel copied={copied} label="Copy agent prompt" iconClassName="size-3" />
          </Button>
        </div>
      )}
    </li>
  );
}

const EMPTY = {
  "not-web": ["Not a web page", "Open a website to see what its WebMCP tools let you and your agent do.", "Empty state: not a web page"],
  insecure: ["This page isn't secure", "WebMCP only works on https pages (and localhost). This page uses plain http, so Chrome doesn't offer page tools here.", "Empty state: page isn't secure"],
  "no-webmcp": ["WebMCP is probably off in this Chrome", "Chrome only offers WebMCP when its test flag is on, or on sites in Google's trial. We didn't find it on this page, so the flag is most likely off.", "Empty state: WebMCP is probably off"],
  "no-tools": ["This site has no WebMCP tools yet", "WebMCP is on in your Chrome, but this page hasn't added any tools. Most sites haven't yet.", "Empty state: no WebMCP tools on this page"],
} as const;

function Empty({ state, favIconUrl, onRecheck, onDiscover }: { state: Extract<State, { kind: "empty" }>; favIconUrl?: string; onRecheck?: () => void; onDiscover: () => void }) {
  const [title, body, label] = EMPTY[state.reason];
  const [flagFailed, setFlagFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyFlag = async () => { await navigator.clipboard.writeText(WEBMCP_FLAG_URL); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const turnOnFlag = async () => {
    const result = await openWebmcpFlag((props) => chrome.tabs.create(props));
    if (result === "opened") { if (!new URLSearchParams(location.search).has("view")) window.close(); }
    else setFlagFailed(true);
  };
  return (
    <div role="status" aria-label={label} data-state={`empty-${state.reason}`} className="flex items-start gap-2.5 py-4">
      <SiteIcon host={state.host} src={state.host ? favIconUrl : undefined} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {state.host && <div className="truncate text-xs text-muted-foreground">{bare(state.host)}</div>}
        {state.reason === "not-web" ? <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{body}</p> : (
          <div data-testid="flag-hint" data-reason={state.reason}>
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{body}</p>
            {state.reason === "no-webmcp" && <div className="mt-1.5">
              <Button size="xs" variant="outline" onClick={turnOnFlag} data-testid="open-webmcp-flag" className="h-6 px-2 text-[11px]">Turn on WebMCP in Chrome</Button>
              {!flagFailed ? <div className="mt-1 text-[10.5px] text-muted-foreground" data-testid="webmcp-flag-note">Set it to Enabled, then relaunch Chrome.</div> : <>
                <div className="mt-1 flex items-center gap-2"><Button size="xs" variant="outline" onClick={copyFlag} data-testid="copy-webmcp-flag" className="h-6 px-2 text-[11px]"><CopyLabel copied={copied} label="Copy address" iconClassName="size-3" /></Button><span className="text-[10.5px] text-muted-foreground" data-testid="copy-webmcp-flag-note">Paste it into the address bar.</span></div>
                <code className="mt-1 block break-all font-mono text-[10.5px] text-muted-foreground">{WEBMCP_FLAG_URL}</code>
              </>}
            </div>}
            {state.reason === "no-tools" && <Button size="xs" variant="link" onClick={onDiscover} data-testid="discover-with-tools" className="mt-1 h-auto px-0 py-0.5 text-[11px] underline">Discover sites with tools</Button>}
          </div>
        )}
        {onRecheck && <RecheckButton onClick={onRecheck} className="mt-1 -ml-1.5" />}
      </div>
    </div>
  );
}

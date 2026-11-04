import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabelPill } from "@/components/label-pill";
import { PageShell } from "@/components/page-shell";
import { SiteIcon } from "@/components/site-icon";
import { ConnectAgent } from "@/components/connect-agent";
import { countPills } from "@/lib/count-pills";
import { CATEGORIES, directory, handoffPrompt, isNoBridge, loadIndex, recommend, searchCards, showRecommended, type SiteCard } from "@/lib/site-data";
import { cn } from "@/lib/utils";

type State = { kind: "loading" } | { kind: "ready"; entries: unknown[] } | { kind: "connect" } | { kind: "error"; message: string };
const ALL = "All";

export function Discover() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState(ALL);
  useEffect(() => { loadIndex().then((r) => setState({ kind: "ready", entries: r.entries }), (e) => { const message = String(e?.message ?? e); setState(isNoBridge(message) ? { kind: "connect" } : { kind: "error", message }); }); }, []);

  return (
    <PageShell title="Discover sites with WebMCP" subtitle="Sites in your local index: ones Secret Menu has explained on this computer. Nothing here comes from a remote directory.">
      {state.kind === "loading" && <div role="status" aria-label="Loading: reading your local index" data-state="loading" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading your local index…</div>}
      {state.kind === "connect" && <div data-state="connect"><ConnectAgent why="Discover lists the sites Secret Menu has explained on this computer. That local index lives with the Secret Menu bridge, which isn't set up yet. The popup works without it." /></div>}
      {state.kind === "error" && (
        <div role="status" aria-label="Error: local index unavailable" data-state="error" className="space-y-1 text-sm">
          <div className="font-semibold">Can't read your local index</div>
          <div className="text-muted-foreground">The index lives with the Secret Menu bridge, which isn't connected ({state.message}). Run <code className="font-mono">npx secret-menu doctor</code> to see what's wrong, then reopen this page.</div>
        </div>
      )}
      {state.kind === "ready" && <Directory entries={state.entries} query={query} setQuery={setQuery} chip={chip} setChip={setChip} />}
    </PageShell>
  );
}

function Directory({ entries, query, setQuery, chip, setChip }: { entries: unknown[]; query: string; setQuery: (q: string) => void; chip: string; setChip: (c: string) => void }) {
  const dir = useMemo(() => directory(entries), [entries]);
  const rec = useMemo(() => recommend(entries), [entries]);
  const hits = useMemo(() => searchCards(dir.cards, query), [dir, query]);
  const hitSites = new Set(hits.map((c) => c.site));
  const shown = (c: SiteCard) => hitSites.has(c.site) && (chip === ALL || c.category === chip);
  const sections = dir.sections.map((s) => ({ ...s, sites: s.sites.filter(shown) })).filter((s) => s.sites.length);
  const displayedSites = sections.flatMap((s) => s.sites);
  const recommended = rec.items.filter(shown);

  if (!dir.total) {
    return <div role="status" aria-label="Empty state: local index is empty" data-state="empty-index" className="text-sm">Your local index is empty. Run <code className="font-mono">secret-menu explain</code> on a site with WebMCP tools and it will show up here.</div>;
  }
  return (
    <div className="space-y-5" data-state="ready">
      <div className="flex items-center gap-2 rounded-full border bg-background px-3.5 py-2">
        <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sites, abilities or tool names" aria-label="Search sites" className="flex-1 bg-transparent text-sm outline-none" />
        {query && <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>}
      </div>
      <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
        {[ALL, ...CATEGORIES].map((c) => (
          <button key={c} type="button" role="radio" aria-checked={chip === c} onClick={() => setChip(c)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm", chip === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>{c}</button>
        ))}
      </div>

      {showRecommended(recommended, displayedSites, { query }) && <section aria-label="Recommended for you" data-testid="recommended">
        <h2 className="text-sm font-semibold">Recommended for you</h2>
        <div className="mb-1 text-xs text-muted-foreground">{rec.items.length ? `Why: ${rec.reason}.` : rec.reason}</div>
        {recommended.length > 0 && <ul className="divide-y" aria-label="Recommended sites">{recommended.map((c) => <SiteRow key={c.site} c={c} />)}</ul>}
      </section>}

      {sections.length === 0 && <div role="status" aria-label="Empty state: no matching sites" data-state="empty-search" className="text-sm text-muted-foreground">
        <span>No indexed site matches{query ? ` "${query}"` : ""}{chip !== ALL ? ` in ${chip}` : ""}.</span>
        {query && <button type="button" onClick={() => setQuery("")} className="ml-2 underline">Clear search</button>}
        {chip !== ALL && <button type="button" onClick={() => setChip(ALL)} className="ml-2 underline">Try All</button>}
      </div>}
      {sections.map((s) => (
        <section key={s.category} aria-label={`${s.category}: ${s.total} site${s.total === 1 ? "" : "s"}`}>
          <h2 className="text-sm font-semibold">{s.category} <span className="font-normal text-muted-foreground">· top {s.sites.length} of {s.total} by tool count</span></h2>
          <ul className="divide-y">{s.sites.map((c) => <SiteRow key={c.site} c={c} />)}</ul>
        </section>
      ))}
      {chip !== ALL && !dir.cards.some((c) => c.category === chip) && (
        <div role="status" aria-label={`Empty state: no ${chip} sites`} data-state="empty-category" className="text-sm text-muted-foreground">No {chip} sites in your index yet. That's honest: Secret Menu hasn't explained one on this computer.</div>
      )}
      <footer className="border-t pt-3 text-xs leading-relaxed text-muted-foreground" data-testid="discover-footer">
        {dir.total} site{dir.total === 1 ? "" : "s"} in your local index. Categories are guessed by Secret Menu's rules from tool names and page titles.
        {dir.emptyCategories.length > 0 && <> Nothing indexed yet in: {dir.emptyCategories.join(", ")}.</>} Nothing here comes from a remote directory.
      </footer>
    </div>
  );
}

function SiteRow({ c }: { c: SiteCard }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(handoffPrompt({ host: c.host, abilities: c.abilities })); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const n = c.counts;
  return (
    <li className="flex items-center gap-3 py-2.5" aria-label={`Site: ${c.name}, ${n?.tools ?? 0} tools`} data-testid="site-row">
      <SiteIcon host={c.host} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{c.name}</span>
          <span className="text-xs text-muted-foreground">{c.host.replace(/^www\./, "")} · {n?.tools ?? "?"} tools</span>
          {c.local && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">test page</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{c.oneLiner}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {countPills(n).map((pill) => <LabelPill key={pill.label} label={pill.label}>{pill.text}</LabelPill>)}
          <span className="text-[11px] text-muted-foreground" title={c.categoryBasis}>{c.category} (guessed)</span>
          {c.verifiedAt && <span className="text-[11px] text-muted-foreground">verified {new Date(c.verifiedAt).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex flex-none gap-1.5">
        <Button size="xs" variant="outline" aria-label={`Open ${c.name}`} onClick={() => chrome.tabs.create({ url: c.site })}><ExternalLink aria-hidden="true" /> Open</Button>
        <Button size="xs" variant="outline" aria-label={`Hand off ${c.name}`} onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL(`/handoff.html?site=${encodeURIComponent(c.site)}` as any) })}><Send aria-hidden="true" /> Hand off</Button>
        <Button size="xs" variant="ghost" aria-label={`Copy agent prompt for ${c.name}`} onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied" : "Copy agent prompt"}</Button>
      </div>
    </li>
  );
}

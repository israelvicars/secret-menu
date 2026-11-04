import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabelPill } from "@/components/label-pill";
import { PageShell, Switch } from "@/components/page-shell";
import { explainTab, NO_WEBMCP } from "@/lib/abilities";
import { bare, hostOf } from "@/lib/pages";
import { ConnectAgent } from "@/components/connect-agent";
import { handoffGroups, handoffPrompt, isNoBridge, loadIndex, type IndexAbility } from "@/lib/site-data";
import { shortTitle } from "@/lib/short-title";
import type { Label } from "@/lib/abilities";

type Source = { host: string; abilities: IndexAbility[]; from: string };
type State = { kind: "loading" } | { kind: "ready"; source: Source } | { kind: "empty"; message: string } | { kind: "connect" } | { kind: "error"; message: string };
const SHOW_RUN_IN_AGENT = false; // Keep this path ready until the agent runner is built.

// ?tab=<id>: a live tab, explained now (same as the popup). ?site=<origin>: the local index entry.
async function loadSource(): Promise<State> {
  const q = new URLSearchParams(location.search);
  const tab = q.get("tab"), site = q.get("site");
  if (tab) {
    const t = await chrome.tabs.get(Number(tab));
    try {
      const r = await explainTab({ id: t.id!, url: t.url, title: t.title });
      if (!r.counts.tools) return { kind: "empty", message: `No WebMCP tools on ${bare(hostOf(t.url))} right now.` };
      return { kind: "ready", source: { host: hostOf(r.url), abilities: r.abilities, from: `live tab, read just now (${r.counts.tools} tools)` } };
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      return NO_WEBMCP.test(m) ? { kind: "empty", message: `No WebMCP on ${bare(hostOf(t.url))}.` } : { kind: "error", message: m };
    }
  }
  if (site) {
    let entries: unknown[];
    try { ({ entries } = await loadIndex()); }
    catch (e) { if (isNoBridge(String((e as Error)?.message ?? e))) return { kind: "connect" }; throw e; }
    const e = (entries as { indexKey?: string; abilities?: IndexAbility[]; verifiedAt?: string; counts?: { tools: number } }[]).find((x) => x.indexKey === site);
    if (!e) return { kind: "empty", message: `${site} isn't in your local index. Run secret-menu explain on it first.` };
    return { kind: "ready", source: { host: hostOf(site), abilities: e.abilities ?? [], from: `local index, verified ${e.verifiedAt ? new Date(e.verifiedAt).toLocaleString() : "at an unknown time"} (${e.counts?.tools ?? "?"} tools)` } };
  }
  return { kind: "empty", message: "Open this from the popup (Hand off to an agent) or from Discover, so it knows which site to use." };
}

export function Handoff() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // The prompt only works once the agent can reach the page through the bridge; check it quietly.
  const [bridge, setBridge] = useState<"unknown" | "ok" | "missing">("unknown");
  useEffect(() => { loadSource().then(setState, (e) => setState({ kind: "error", message: String(e?.message ?? e) })); }, []);
  useEffect(() => { loadIndex().then(() => setBridge("ok"), (e) => setBridge(isNoBridge(String(e?.message ?? e)) ? "missing" : "ok")); }, []);
  const host = state.kind === "ready" ? bare(state.source.host) : "";
  return (
    <PageShell title={host ? `Hand off ${host} to an agent` : "Hand off to an agent"} subtitle="Write what you want done. Secret Menu turns it into a prompt that names the page's real tools and says which ones need your yes.">
      {state.kind === "loading" && <div role="status" aria-label="Loading: reading the site's tools" data-state="loading" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading the site's tools…</div>}
      {state.kind === "empty" && <div role="status" aria-label="Empty state: no tools to hand off" data-state="empty" className="text-sm">{state.message}</div>}
      {state.kind === "error" && <div role="status" aria-label="Error: couldn't read the site's tools" data-state="error" className="text-sm"><div className="font-semibold">Couldn't read the site's tools</div><div className="text-muted-foreground">{state.message}</div></div>}
      {state.kind === "connect" && <div data-state="connect"><ConnectAgent why="This site comes from your local index, which lives with the Secret Menu bridge. It isn't set up yet." /></div>}
      {state.kind === "ready" && <Planner source={state.source} needsConnect={bridge === "missing"} />}
    </PageShell>
  );
}

function Planner({ source, needsConnect }: { source: Source; needsConnect: boolean }) {
  const [task, setTask] = useState("");
  const [allowChanges, setAllowChanges] = useState(false);
  const [allowSpends, setAllowSpends] = useState(false);
  const [copied, setCopied] = useState(false);
  const plan = useMemo(() => handoffGroups(source.abilities, { allowChanges, allowSpends }), [source, allowChanges, allowSpends]);
  const prompt = useMemo(() => handoffPrompt({ host: source.host, task, abilities: source.abilities, allowChanges, allowSpends }), [source, task, allowChanges, allowSpends]);
  const copy = async () => { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_1fr]" data-state="ready">
      <section aria-label="Task and permissions" className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="task">What should the agent do?</label>
        <textarea id="task" value={task} onChange={(e) => setTask(e.target.value)} rows={3} placeholder="e.g. find men's running shoes under $120 in size 10"
          className="w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
        <div>
          <Switch checked={allowChanges} onChange={setAllowChanges} label="Let it change data (asks first)" hint="Carts, profiles, lists. Off: it won't call these at all." />
          <Switch checked={allowSpends} onChange={setAllowSpends} label="Let it spend money (asks first)" hint="Checkout, orders, gift cards. Off: it won't call these at all." />
        </div>
        <div className="text-xs text-muted-foreground">Tools from: {source.from}</div>
      </section>
      <section aria-label="Agent prompt" className="space-y-2">
        <h2 className="text-sm font-medium">What "Copy agent prompt" copies</h2>
        <div className="rounded-lg border bg-code p-3 text-[13px] leading-relaxed" data-testid="handoff-prompt">{prompt}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={copy} aria-label="Copy agent prompt">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied" : "Copy agent prompt"}</Button>
          {SHOW_RUN_IN_AGENT && <><Button size="sm" variant="outline" disabled aria-label="Run in agent (not built yet)" title="Not built yet: paste the prompt into your agent">Run in agent</Button><span className="text-xs text-muted-foreground">Run in agent isn't built yet. Paste the prompt into an agent that has Secret Menu connected.</span></>}
        </div>
      </section>
      {needsConnect && <div className="md:col-span-2"><ConnectAgent why="Your agent calls these tools through Secret Menu, so it needs a one-time setup on this computer before the prompt will work." /></div>}
      <section className="grid gap-3 md:col-span-2 md:grid-cols-3" aria-label="What the agent may call">
        <PlanColumn title="Runs without asking" items={plan.run} testid="plan-run" />
        <PlanColumn title="Asks you first" items={plan.ask} testid="plan-ask" />
        <PlanColumn title="Won't call" items={plan.never} testid="plan-never" />
      </section>
    </div>
  );
}

function PlanColumn({ title, items, testid }: { title: string; items: IndexAbility[]; testid: string }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toolCount = items.reduce((total, ability) => total + ability.toolNames.length, 0);
  const toggle = (index: number) => setExpanded((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  return (
    <div className="px-1 md:px-4" role="group" aria-label={`${title}: ${toolCount} tool${toolCount === 1 ? "" : "s"}`} data-testid={testid}>
      <div className="mb-2 text-xs font-medium">{title} <span className="text-muted-foreground">({toolCount})</span></div>
      {items.length === 0 ? <div className="text-xs text-muted-foreground">None</div> : (
        <ul className="space-y-2">
          {items.map((ability, index) => {
            const isExpanded = expanded.has(index);
            const controls = `${testid}-ability-${index}`;
            return <li key={`${ability.title}-${index}`}>
              <button type="button" className="flex w-full items-center gap-1.5 text-left text-xs" aria-expanded={isExpanded} aria-controls={controls} aria-label={`${isExpanded ? "Hide" : "Show"} tools for ${ability.title}`} title={ability.title} onClick={() => toggle(index)}>
                <ChevronDown className={isExpanded ? "size-3.5" : "size-3.5 -rotate-90"} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">{shortTitle(ability)}</span>
                <LabelPill label={ability.label as Label} className="h-4 flex-none text-[10px]" />
              </button>
              {isExpanded && <div id={controls} className="ml-5 mt-1 space-y-1">
                <div className="text-xs text-muted-foreground">{ability.title}</div>
                <div className="flex flex-wrap gap-1">{ability.toolNames.map((name) => <code key={name} title={name} className="max-w-full break-all [overflow-wrap:anywhere] rounded border bg-code px-1 py-px font-mono text-[11px] text-code-foreground">{name}</code>)}</div>
              </div>}
            </li>
          })}
        </ul>
      )}
    </div>
  );
}

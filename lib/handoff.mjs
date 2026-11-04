// The agent hand-off prompt: a template filled with the real tool names from explain (live tab) or
// the local index. Reads run freely; changes and spending are off unless you allow them, and even
// then the agent must show what will happen and wait for your yes. Nothing here calls a tool.

const READ = new Set(["safe", "changes the view", "needs sign-in"]);
const list = (names) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
const uniq = (xs) => [...new Set(xs)];

export function handoffGroups(abilities, { allowChanges = false, allowSpends = false } = {}) {
  const groups = { run: [], ask: [], never: [] };
  for (const a of abilities ?? []) {
    if (READ.has(a.label)) groups.run.push(a);
    else if (a.label === "changes data") (allowChanges ? groups.ask : groups.never).push(a);
    else if (a.label === "spends money") (allowSpends ? groups.ask : groups.never).push(a);
    else groups.never.push(a);
  }
  return groups;
}

export function handoffPlan(abilities, { allowChanges = false, allowSpends = false } = {}) {
  const plan = { run: [], ask: [], never: [] };
  for (const a of abilities ?? []) {
    const names = a.toolNames ?? [];
    if (READ.has(a.label)) plan.run.push(...names.map((name) => ({ name, label: a.label })));
    else if (a.label === "changes data") (allowChanges ? plan.ask : plan.never).push(...names.map((name) => ({ name, label: a.label })));
    else if (a.label === "spends money") (allowSpends ? plan.ask : plan.never).push(...names.map((name) => ({ name, label: a.label })));
    else plan.never.push(...names.map((name) => ({ name, label: a.label ?? "unknown" })));
  }
  return plan;
}

export function handoffPrompt({ host, task, abilities, allowChanges = false, allowSpends = false }) {
  const site = String(host ?? "").replace(/^www\./, "") || "this site";
  const what = String(task ?? "").trim().replace(/[.\s]+$/, "") || "<what you want done>";
  const plan = handoffPlan(abilities, { allowChanges, allowSpends });
  const signIn = (abilities ?? []).some((a) => a.label === "needs sign-in");
  const parts = [`On ${site}, ${what}.`];
  const reads = uniq(plan.run.map((t) => t.name)), asks = uniq(plan.ask.map((t) => t.name)), never = uniq(plan.never.map((t) => t.name));
  if (reads.length || asks.length) {
    let use = "Use the page's WebMCP tools through Secret Menu:";
    if (reads.length) use += ` ${list(reads)} to look (these only read or change the view)`;
    if (asks.length) use += `${reads.length ? ", then" : ""} ${list(asks)}`;
    parts.push(`${use}.`);
  } else parts.push("This site has no WebMCP tools you have allowed; tell me what you would need.");
  if (asks.length) parts.push(`Before calling ${list(asks)}, show me exactly what will ${plan.ask.some((t) => t.label === "spends money") ? "change or be charged" : "change"} and wait for my yes.`);
  if (never.length) parts.push(`Never call ${list(never)}.`);
  if (signIn) parts.push("If a tool needs sign-in, ask me to sign in to the site in your Chrome; never ask for my password.");
  parts.push("Stop before confirming.");
  return parts.join(" ");
}

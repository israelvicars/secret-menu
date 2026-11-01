export function diffToolLists(previous = [], current = []) {
  const before = new Map(previous.map((tool) => [tool.name, tool]));
  const after = new Map(current.map((tool) => [tool.name, tool]));
  const fingerprint = (tool) => JSON.stringify([
    tool.description,
    tool.inputSchema,
    tool.annotations,
  ]);
  const events = [];

  for (const [name, tool] of after) {
    if (!before.has(name)) events.push({ kind: "added", name });
    else if (fingerprint(tool) !== fingerprint(before.get(name))) {
      events.push({ kind: "changed", name });
    }
  }
  for (const name of before.keys()) {
    if (!after.has(name)) events.push({ kind: "removed", name });
  }
  return events;
}

export function applySnapshot(state, tabId, tools, via) {
  const nextState = new Map(state);
  const previous = nextState.get(tabId) ?? [];
  nextState.set(tabId, tools);
  const events = diffToolLists(previous, tools).map((event) => ({ ...event, via }));
  return { events, state: nextState };
}

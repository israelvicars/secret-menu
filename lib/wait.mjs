import { canonical } from "./core.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fingerprint = (tools) => canonical((tools ?? []).map((tool) => ({
  name: tool.name,
  inputSchema: tool.inputSchema,
  description: tool.description,
  annotations: tool.annotations,
})).sort((a, b) => String(a.name).localeCompare(String(b.name))));

// Wait until the tool list stops changing. With `name`, return once that tool is present and the
// list has been stable for settleMs (default 300). Without `name`, the list must be unchanged for a
// quiet window (default 3500 ms) so tools that register a few seconds after load are caught; the
// overall timeout caps the wait.
export async function waitForTools(listFn, { timeoutMs = 10000, settleMs, name, now = Date.now, sleep = delay, pollMs = 50 } = {}) {
  const quietMs = settleMs ?? (name ? 300 : 3500);
  const started = now();
  let last = [];
  let stableSince = null;
  let stableFingerprint = null;
  let changes = 0;
  while (now() - started <= timeoutMs) {
    last = await listFn();
    const ready = last.length > 0 && (!name || last.some((tool) => tool.name === name));
    const currentFingerprint = fingerprint(last);
    if (ready && currentFingerprint === stableFingerprint) {
      if (stableSince == null) stableSince = now();
      if (now() - stableSince >= quietMs) return { tools: last, waitedMs: now() - started, changes };
    } else {
      if (stableFingerprint != null && currentFingerprint !== stableFingerprint) changes++;
      stableFingerprint = currentFingerprint;
      stableSince = ready ? now() : null;
    }
    await sleep(Math.min(pollMs, Math.max(1, timeoutMs - (now() - started))));
  }
  return { tools: last, waitedMs: now() - started, changes, timedOut: true };
}

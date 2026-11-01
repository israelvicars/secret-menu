// Stop policy for `secret-menu stop`: SIGTERM, wait up to the timeout, and only escalate to SIGKILL when asked (--kill).
export const DEFAULT_STOP_TIMEOUT_MS = 8000;

export function parseStopTimeout(value) {
  if (value == null) return DEFAULT_STOP_TIMEOUT_MS;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`--timeout must be a positive number of seconds, got ${value}`);
  return Math.round(seconds * 1000);
}

// pids: numbers. alive(): Promise<Set<number>>. signal(pid, sig) sends a signal (ignore ESRCH inside).
export async function terminate(pids, { alive, signal, timeoutMs = DEFAULT_STOP_TIMEOUT_MS, kill = false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }) {
  for (const pid of pids) signal(pid, "SIGTERM");
  const deadline = now() + timeoutMs;
  let remaining = [...pids];
  while (remaining.length && now() < deadline) {
    await sleep(100);
    const live = await alive();
    remaining = remaining.filter((pid) => live.has(pid));
  }
  if (!remaining.length) return { stopped: [...pids], remaining: [], killed: [] };
  if (!kill) return { stopped: pids.filter((p) => !remaining.includes(p)), remaining, killed: [] };
  for (const pid of remaining) signal(pid, "SIGKILL");
  return { stopped: [...pids], remaining: [], killed: remaining };
}

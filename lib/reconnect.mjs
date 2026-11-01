// Keep a subscription alive across native-host restarts.
// connect() resolves to { closed: Promise } once subscribed (rejects if the bridge is down);
// when `closed` settles, we retry with capped backoff until connect() succeeds again.
export async function superviseSubscription({
  connect,
  onState = () => {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  initialDelayMs = 250,
  maxDelayMs = 5000,
  isStopped = () => false,
}) {
  let attempt = 0;
  let connectedOnce = false;
  while (!isStopped()) {
    let session;
    try {
      session = await connect({ reconnect: connectedOnce });
    } catch (error) {
      if (!connectedOnce) throw error; // first connect failing is a real error, not a restart
      const wait = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt++);
      onState({ state: "retrying", attempt, waitMs: wait, error: error.message });
      await sleep(wait);
      continue;
    }
    onState({ state: connectedOnce ? "reconnected" : "connected", attempt });
    connectedOnce = true;
    attempt = 0;
    await session.closed.catch(() => {});
    if (isStopped()) break;
    onState({ state: "disconnected" });
  }
}

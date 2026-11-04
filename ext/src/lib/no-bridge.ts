// The native host is not installed or not running: a normal first-run state, not an error.
// Matches NO_BRIDGE in bridge/background.js.
export const NO_BRIDGE_RE = /isn't connected to this computer yet/;
export const isNoBridge = (message: string) => NO_BRIDGE_RE.test(message);

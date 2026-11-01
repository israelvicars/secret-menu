// One-time, non-destructive move from the pre-rename data dir (~/.webmcp-tinker) to ~/.secret-menu.
// - Until it has run, everything keeps using the old dir, so nothing breaks mid-way.
// - It copies; it never deletes or edits the old dir. If ~/.secret-menu already has an entry with
//   the same name (e.g. a stale chrome-profile from before the project was called tinker), that
//   entry is renamed to "<name>.pre-migration-<stamp>" rather than overwritten.
// - It refuses while a Chrome is using the old profile (copying a live profile corrupts it).
// Only `secret-menu launch` runs it (bin/secret-menu), before anything resolves DATA_HOME.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export const MARKER = ".migrated-from-webmcp-tinker.json";
const SKIP = new Set(["run", "native-host", ".DS_Store"]); // runtime state and a wrapper launch rewrites
const LEGACY_HOST_MANIFEST = "com.webmcptinker.bridge.json";

export function resolveDataHome({ override, home, legacy }) {
  if (override) return override;
  if (existsSync(join(home, MARKER))) return home;
  if (existsSync(legacy)) return legacy;
  return home;
}

// Chrome's SingletonLock is a symlink to "<hostname>-<pid>". A Chrome stopped with TERM/KILL can leave it
// behind, which used to block the migration forever. Stale = same host and that pid is gone.
// Anything unexpected (not a symlink, another host, unparsable) counts as locked, to stay safe.
export function legacyProfileLocked(legacy, { host = hostname(), alive = pidAlive } = {}) {
  const lock = join(legacy, "chrome-profile", "SingletonLock");
  try { lstatSync(lock); } catch { return false; }
  let target;
  try { target = readlinkSync(lock); } catch { return true; }
  const m = /^(.+)-(\d+)$/.exec(target);
  if (!m || m[1] !== host) return true;
  return alive(Number(m[2]));
}
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

export function migrateLegacyHome({ legacy, home, override, inUse = () => legacyProfileLocked(legacy), now = Date.now() }) {
  if (override) return { status: "override" };
  if (!existsSync(legacy)) return { status: "none" };
  if (existsSync(join(home, MARKER))) return { status: "done" };
  if (inUse()) return { status: "skipped", message: `Not moving ${legacy} to ${home} yet: a Chrome is still using its profile. Quit it and run launch again; until then the old folder stays in use.` };
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const copied = [], setAside = [];
  for (const name of readdirSync(legacy)) {
    if (SKIP.has(name)) continue;
    const to = join(home, name);
    if (existsSync(to)) { const aside = `${to}.pre-migration-${stamp(now)}`; renameSync(to, aside); setAside.push(aside); }
    cpSync(join(legacy, name), to, { recursive: true, preserveTimestamps: true, filter: (src) => !/\/Singleton(Lock|Socket|Cookie)$/.test(src) });
    copied.push(name);
  }
  // The copied profile may hold the old-name host manifest Secret Menu installed; nothing uses it there.
  const oldManifest = join(home, "chrome-profile", "NativeMessagingHosts", LEGACY_HOST_MANIFEST);
  try { if (/webmcp-tinker-host/.test(readFileSync(oldManifest, "utf8"))) rmSync(oldManifest); } catch {}
  writeFileSync(join(home, MARKER), `${JSON.stringify({ from: legacy, at: new Date(now).toISOString(), copied, setAside }, null, 2)}\n`);
  return { status: "migrated", copied, setAside, message: `Copied ${copied.join(", ")} from ${legacy} to ${home} (the old folder is untouched${setAside.length ? `; earlier copies kept as ${setAside.join(", ")}` : ""}).` };
}

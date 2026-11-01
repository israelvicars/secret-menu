import { homedir } from "node:os";
import { join } from "node:path";
import { resolveDataHome } from "../lib/migrate.mjs";

// Read a renamed env var, falling back to its pre-rename name (WEBMCP_TINKER_* / TINKER_*).
export function envWithFallback(name, legacyName, env = process.env) {
  return env[name] ?? (legacyName ? env[legacyName] : undefined);
}

export const HOST_NAME = "com.secretmenu.bridge";
// Pre-rename host name; only used to tidy up manifests Secret Menu itself installed.
export const LEGACY_HOST_NAME = "com.webmcptinker.bridge";
export const NEW_HOME = join(homedir(), ".secret-menu");
// Pre-rename data dir. Never deleted; copied into NEW_HOME once by `secret-menu launch` (lib/migrate.mjs).
export const LEGACY_HOME = join(homedir(), ".webmcp-tinker");
export const DATA_HOME = resolveDataHome({ override: envWithFallback("SECRET_MENU_HOME", "WEBMCP_TINKER_HOME"), home: NEW_HOME, legacy: LEGACY_HOME });
export const RUN_DIR = join(DATA_HOME, "run");
export const SOCKET_PATH = join(RUN_DIR, "bridge.sock");
export const HOST_LOG = join(RUN_DIR, "native-host.log");
export const AUDIT_PATH = join(DATA_HOME, "audit.jsonl");
export const APPROVALS_DIR = join(DATA_HOME, "approvals");
export const PROFILE_DIR = join(DATA_HOME, "chrome-profile");
export const POLICY_PATH = join(DATA_HOME, "sites.json");
export const OPENED_TABS_PATH = join(RUN_DIR, "opened-tabs.json");

import { homedir } from "node:os";
import { join } from "node:path";

export const HOST_NAME = "com.secretmenu.bridge";
export const NEW_HOME = join(homedir(), ".secret-menu");
export const DATA_HOME = process.env.SECRET_MENU_HOME || NEW_HOME;
export const RUN_DIR = join(DATA_HOME, "run");
export const SOCKET_PATH = join(RUN_DIR, "bridge.sock");
export const HOST_LOG = join(RUN_DIR, "native-host.log");
export const AUDIT_PATH = join(DATA_HOME, "audit.jsonl");
export const APPROVALS_DIR = join(DATA_HOME, "approvals");
export const PROFILE_DIR = join(DATA_HOME, "chrome-profile");
export const POLICY_PATH = join(DATA_HOME, "sites.json");
export const OPENED_TABS_PATH = join(RUN_DIR, "opened-tabs.json");

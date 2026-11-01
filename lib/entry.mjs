// Shared entry for bin/secret-menu and the deprecated bin/tinker alias. The data-dir migration has to
// run before anything imports host/paths.mjs (which resolves DATA_HOME once), so the CLI loads after it.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { legacyProfileLocked, migrateLegacyHome } from "./migrate.mjs";
import { findProfileBrowsers, parsePsOutput } from "./procs.mjs";

export async function runCli(argv = process.argv.slice(2)) {
  if (argv[0] === "launch") {
    const legacy = join(homedir(), ".webmcp-tinker");
    const inUse = () => {
      if (legacyProfileLocked(legacy)) return true;
      try { return findProfileBrowsers(parsePsOutput(execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })), join(legacy, "chrome-profile")).length > 0; } catch { return true; }
    };
    const override = process.env.SECRET_MENU_HOME ?? process.env.WEBMCP_TINKER_HOME;
    const result = migrateLegacyHome({ legacy, home: join(homedir(), ".secret-menu"), override, inUse });
    if (result.message) console.error(result.message);
  }
  await import("./cli.mjs");
}

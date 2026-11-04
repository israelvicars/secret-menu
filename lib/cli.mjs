import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { APPROVALS_DIR, AUDIT_PATH, DATA_HOME, NEW_HOME, OPENED_TABS_PATH, POLICY_PATH, PROFILE_DIR, RUN_DIR, SOCKET_PATH } from "../host/paths.mjs";
import { describeForeign, foreignTabs, forgetOpened, isOpenedBySecretMenu, loadOpened, matchLaunchTabs, recordOpened } from "../lib/opened-tabs.mjs";
import { addToPolicy, decideTool, loadPolicy, normalizeOrigin, removeFromPolicy, savePolicy, siteFor } from "../lib/policy.mjs";
import { redactText } from "../lib/redact.mjs";
import { normalizePageContext } from "../lib/page-context.mjs";
import { classifyTool, explainTools, renderExplain, seedCandidates } from "../lib/explain.mjs";
import { cacheExplain } from "../lib/learn.mjs";
import { installNativeHost } from "../host/install-native-host.mjs";
import { listApprovals, readApproval, writeApproval } from "../lib/approvals.mjs";
import { parseArgs } from "../lib/args.mjs";
import { appendAudit, readAudit, readAuditAnchor, verifyAudit } from "../lib/audit.mjs";
import { canonical, coerceValue, exampleValue, parseSchema, renderForm, sha256, unwrapResult, validateArgs } from "../lib/core.mjs";
import { chromeArgs as buildChromeArgs } from "../lib/chrome-args.mjs";
import { extensionDigest } from "../lib/extension.mjs";
import { findProfileBrowsers, parsePsOutput } from "../lib/procs.mjs";
import { superviseSubscription } from "../lib/reconnect.mjs";
import { relay } from "../lib/relay.mjs";
import { waitForTools } from "../lib/wait.mjs";
import { parseStopTimeout, terminate } from "../lib/stop.mjs";
import { COMMANDS, TAGLINE, commandHelp, helpText } from "../lib/cli-help.mjs";
import { doctor, nextStepText, resolveExtensionIds, setup, uninstall } from "../lib/setup.mjs";

const USAGE = helpText(DATA_HOME);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const commandArgv = process.argv.slice(2);
const command = commandArgv.shift();
let args = { positionals: [], values: {}, booleans: {}, multi: {} };
const flag = (name) => args.booleans[name.slice(2)] === true;
const option = (name, fallback) => args.values[name.slice(2)] ?? fallback;
const options = (name) => args.multi[name.slice(2)] ?? (option(name) == null ? [] : [option(name)]);
const tabId = () => option("--tab") == null ? undefined : Number(option("--tab"));
const request = (method, params = {}, approval = "n/a") => relay(method, params, { caller: "cli", approval });
const die = (message, code = 1) => { console.error(message); process.exit(code); };
const output = (value, json = false) => console.log(json ? JSON.stringify(value, null, 2) : value);
const execFileAsync = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function chromeCandidates(base) { const dir = join(base, "browsers", "chrome"); try { return readdirSync(dir).filter((x) => x.startsWith("mac_arm-")).sort().reverse().map((x) => join(dir, x, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")).filter(existsSync); } catch { return []; } }
async function prompt(question) { const rl = createInterface({ input: process.stdin, output: process.stdout }); try { return await rl.question(question); } finally { rl.close(); } }
async function profileBrowsers() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="]);
  return findProfileBrowsers(parsePsOutput(stdout), PROFILE_DIR);
}

async function listTools(id = tabId()) { const result = await request("list_page_tools", { tabId: id }); if (result.error) throw new Error(result.error); return result; }
async function waitTools(id, name) { const waited = await waitForTools(async () => (await listTools(id)).tools ?? [], { pollMs: 250, timeoutMs: Number(option("--timeout", 10000)), ...(option("--settle") != null ? { settleMs: Number(option("--settle")) } : {}), name }); return { ...(await listTools(id)), ...waited }; }
function reportTab(data) {
  if (flag("--json")) return;
  if (data.fallback) console.error(`warning: active tab is not a web page; using tab ${data.tab.id}`);
  console.error(`tab ${data.tab.id} ${data.tab.url}`);
}
async function cmdLaunch() {
  const headless = flag("--headless");
  const urls = args.positionals;
  mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
  installNativeHost(PROFILE_DIR);
  const chrome = process.env.SECRET_MENU_CHROME || [...new Set([DATA_HOME, NEW_HOME])].flatMap(chromeCandidates)[0];
  if (!chrome) die(`npx @puppeteer/browsers install chrome@156 --path ${join(DATA_HOME, "browsers")}`);
  // The extension is built by WXT from ext/ (npm run ext:build); Chrome loads the build output.
  const extensionDir = join(root, "ext", ".output", "chrome-mv3");
  if (!existsSync(join(extensionDir, "manifest.json"))) die(`extension not built; run: npm --prefix ${join(root, "ext")} install && npm run ext:build`);
  const chromeArgs = buildChromeArgs({ profileDir: PROFILE_DIR, extensionDir, headless, urls });
  const running = await profileBrowsers();
  const digest = extensionDigest(extensionDir);
  const digestPath = join(PROFILE_DIR, ".secret-menu-extension-digest");
  const stored = existsSync(digestPath) ? readFileSync(digestPath, "utf8").trim() : null;
  if (running.length) {
    console.log(`Chrome already running on the Secret Menu profile (pid ${running[0].pid}); reusing it`);
    if (stored !== digest) {
      console.error("warning: extension code changed but Chrome is running with the old copy; run secret-menu stop first");
    }
    let beforeIds = [];
    if (urls.length) { try { beforeIds = (await request("list_tabs")).map((t) => t.tabId); } catch {} }
    const handoff = spawn(chrome, chromeArgs, { detached: true, stdio: "ignore" });
    handoff.unref();
    await recordLaunchTabs(urls, beforeIds);
    return;
  }
  if (stored !== digest) {
    rmSync(join(PROFILE_DIR, "Default", "Service Worker"), { recursive: true, force: true });
    console.log("extension changed; cleared cached service worker");
    writeFileSync(digestPath, `${digest}\n`);
  }
  // Fresh Chrome: tab ids restart, so ids left over from an earlier session could match someone's new tab.
  forgetOpened(OPENED_TABS_PATH, Object.keys(loadOpened(OPENED_TABS_PATH)));
  const child = spawn(chrome, chromeArgs, { detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + 5000;
  let found = [];
  do {
    found = await profileBrowsers();
    if (found.length) break;
    await delay(100);
  } while (Date.now() < deadline);
  if (!found.length) die("Chrome did not start on the Secret Menu profile within 5 seconds.");
  writeFileSync(join(RUN_DIR, "chrome.pid"), `${found[0].pid}\n`);
  console.log(`Chrome launched (pid ${found[0].pid})`);
  // First run: the bridge comes up ~1 s after Chrome; wait so the next command doesn't race it.
  const bridgeStart = Date.now();
  while (Date.now() - bridgeStart < 10000) {
    try { const s = await request("status"); if (s.extensionReady) { console.log(`Bridge ready in ${Date.now() - bridgeStart} ms`); await recordLaunchTabs(urls, []); return; } } catch {}
    await delay(200);
  }
  console.error("warning: bridge not ready after 10 s; check secret-menu status");
  if (urls.length) console.error("warning: launch tabs not recorded, so secret-menu stop may refuse; use secret-menu close --mine or stop --force");
}
// Record the tabs opened for `launch <url...>` in opened-tabs.json, so stop and close --mine treat them as ours.
async function recordLaunchTabs(urls, beforeIds) {
  if (!urls.length) return;
  const deadline = Date.now() + 5000;
  let matched = [];
  while (Date.now() < deadline) {
    try { matched = matchLaunchTabs(await request("list_tabs"), urls, beforeIds); } catch {}
    if (matched.length >= urls.length) break;
    await delay(250);
  }
  for (const { tabId, url } of matched) recordOpened(OPENED_TABS_PATH, tabId, { url, by: "launch" });
  if (matched.length < urls.length) console.error(`warning: recorded ${matched.length} of ${urls.length} launch tab(s); secret-menu stop may refuse the rest`);
  else console.log(`Recorded ${matched.length} launch tab(s) as Secret Menu's`);
}
async function cmdStop() {
  const pidPath = join(RUN_DIR, "chrome.pid");
  const browsers = await profileBrowsers();
  if (!browsers.length) {
    rmSync(pidPath, { force: true });
    console.log("Chrome is not running on the Secret Menu profile");
    return;
  }
  // Never close tabs a person opened: quitting Chrome closes every tab, so refuse unless all open tabs are Secret Menu's.
  if (!flag("--force")) {
    let tabs;
    try { tabs = await request("list_tabs"); }
    catch { die("Not stopping: Chrome is running on the Secret Menu profile but the bridge is not answering, so I can't check for tabs you opened yourself.\nClose those tabs, then run: secret-menu stop --force", 3); }
    const foreign = foreignTabs(tabs, loadOpened(OPENED_TABS_PATH));
    if (foreign.length) die(`Not stopping: the Secret Menu Chrome has ${foreign.length} tab(s) that Secret Menu did not open:\n${describeForeign(foreign)}\nClose only Secret Menu's own tabs: secret-menu close --mine\nQuit anyway (this closes those tabs too): secret-menu stop --force`, 3);
  }
  let timeoutMs;
  try { timeoutMs = parseStopTimeout(option("--timeout")); } catch (error) { die(error.message, 2); }
  const signal = (pid, sig) => { try { process.kill(pid, sig); } catch (error) { if (error.code !== "ESRCH") throw error; } };
  const alive = async () => new Set((await profileBrowsers()).map((row) => row.pid));
  const result = await terminate(browsers.map((row) => row.pid), { alive, signal, timeoutMs, kill: flag("--kill") });
  for (const pid of result.stopped) console.log(`Stopped Chrome pid ${pid}${result.killed.includes(pid) ? " (SIGKILL after timeout)" : ""}`);
  if (result.remaining.length) die(`Chrome pid(s) ${result.remaining.join(", ")} still running ${timeoutMs / 1000}s after SIGTERM. Not force-killing.\nWait and retry, use --timeout SECONDS, or escalate with: secret-menu stop --kill`, 4);
  rmSync(pidPath, { force: true });
  forgetOpened(OPENED_TABS_PATH, Object.keys(loadOpened(OPENED_TABS_PATH)));
}
async function cmdStatus() {
  const chromePids = (await profileBrowsers()).map((row) => row.pid);
  try { const s = await request("status"); output({ ...s, chromePids }, true); }
  catch { output({ socketUp: existsSync(SOCKET_PATH), extensionReady: false, hostPid: null, hostStartedAt: null, chromePids }, true); }
}
async function cmdHostPid() { const status = await request("status"); console.log(status.hostPid); }
async function cmdTabs() { const tabs = await request("list_tabs"); for (const t of tabs) console.log(`${t.tabId}\t${t.active ? "*" : " "}\t${t.title ?? ""}\t${t.url}`); }
function cliLabels(data) {
  const report = explainTools(data.tools ?? [], { url: data.url });
  return new Map(report.abilities.flatMap((ability) => ability.tools.map((tool) => [tool.name, { label: tool.label, source: tool.source, confidence: tool.confidence }])));
}
async function cmdTools() { const data = flag("--wait-tools") ? await waitTools(tabId()) : await listTools(); reportTab(data); if (flag("--json")) return output(data, true); const labels = cliLabels(data); console.log(`${data.title ?? "Tab"} — ${data.url}\n`); console.log((data.tools ?? []).map((tool) => renderForm(tool, { label: labels.get(tool.name) })).join("\n\n")); }
async function cmdForm() { const name = args.positionals[0]; if (!name) die("usage: secret-menu form <tool> [--tab N]", 2); const data = await listTools(); reportTab(data); const tool = data.tools?.find((x) => x.name === name); if (!tool) die(`Tool not found: ${name}`, 2); const labels = cliLabels(data); console.log(renderForm(tool, { label: labels.get(tool.name) })); const schema = parseSchema(tool.inputSchema); const exampleArgs = Object.entries(schema.properties ?? {}).map(([k, s]) => `--arg ${k}=${JSON.stringify(exampleValue(s))}`).join(" "); console.log(`\nExample: secret-menu call ${name}${exampleArgs ? ` ${exampleArgs}` : ""}`); }
function rawArgs() { return args.multi.arg ?? []; }
async function cmdCall() {
  const name = args.positionals[0]; if (!name) die("usage: secret-menu call <tool> [options]", 2); const data = await listTools(); reportTab(data); const tool = data.tools?.find((x) => x.name === name); if (!tool) die(`Tool not found: ${name}`, 2); const schema = parseSchema(tool.inputSchema); let toolArgs = {};
  const packed = option("--args"); if (packed) { try { toolArgs = JSON.parse(packed); } catch { die("--args must be valid JSON", 2); } }
  for (const pair of rawArgs()) { const at = pair.indexOf("="); if (at < 1) die(`Bad --arg: ${pair}`, 2); const key = pair.slice(0, at), raw = pair.slice(at + 1); try { toolArgs[key] = coerceValue(raw, schema.properties?.[key] ?? {}); } catch (e) { die(`${key}: ${e.message}`, 2); } }
  let missing = (schema.required ?? []).filter((k) => toolArgs[k] === undefined);
  if (missing.length && process.stdin.isTTY) for (const key of missing) { const spec = schema.properties?.[key] ?? {}; const note = [spec.type, spec.description, spec.enum ? `choices: ${spec.enum.join(", ")}` : ""].filter(Boolean).join("; "); const raw = await prompt(`${key} (${note}): `); try { toolArgs[key] = coerceValue(raw, spec); } catch (e) { die(`${key}: ${e.message}`, 2); } }
  missing = (schema.required ?? []).filter((k) => toolArgs[k] === undefined); if (missing.length) die(`Missing required fields: ${missing.join(", ")}`, 2);
  const errors = validateArgs(toolArgs, schema); if (errors.length) die(errors.join("\n"), 2);
  const origin = new URL(data.url).origin; let decision; try { decision = decideTool(loadPolicy(POLICY_PATH), origin, tool); } catch (e) { die(e.message, 2); }
  if (decision.action === "refuse") { await request("audit_note", { tabId: data.tabId, origin, url: data.url, tool: name, args: toolArgs, error: decision.reason }, "refused").catch(() => {}); die(`Refused: ${decision.reason}.\nTo allow it (only if it is read-only): secret-menu allow ${origin} ${name}`, 4); }
  let approval = decision.approval ?? "read-only";
  if (decision.action === "approve") { if (flag("--yes")) approval = "flag-yes"; else if (!process.stdin.isTTY) { await request("audit_note", { tabId: data.tabId, origin: new URL(data.url).origin, url: data.url, tool: name, args: toolArgs, error: "approval refused: non-TTY without --yes" }, "refused").catch(() => {}); die("Refused: this tool is not marked read-only; pass --yes in non-interactive use.", 4); } else { console.log(`Origin: ${new URL(data.url).origin}\nURL: ${data.url}\nTool: ${name}\nHints: ${JSON.stringify(tool.annotations ?? {})}\nArgs: ${JSON.stringify(toolArgs, null, 2)}`); if (!/^y(es)?$/i.test(await prompt("Approve this call? [y/N] "))) { await request("audit_note", { tabId: data.tabId, origin: new URL(data.url).origin, url: data.url, tool: name, args: toolArgs, error: "approval refused by user" }, "refused").catch(() => {}); die("Refused.", 4); } approval = "tty-approved"; } }
  const start = Date.now(), result = await request("call_page_tool", { tabId: data.tabId, name, arguments: toolArgs }, approval); const value = unwrapResult(result); if (flag("--json")) output({ tab: result.tab, result: value }, true); else output(value, typeof value !== "string"); console.error(`Elapsed: ${Date.now() - start} ms`);
}
async function cmdWatch() {
  const seconds = Number(option("--for", 0));
  let watchedTabId = tabId();
  let sub = null;
  let stopped = false;
  const onEvent = (e) => { if (e.kind === "replaced" && e.oldTabId === watchedTabId) watchedTabId = e.newTabId; else if (e.tabId !== watchedTabId) return; const prefix = { added: "+ added", removed: "- removed", changed: "~ changed", nav: "nav", replaced: "replaced" }[e.kind] ?? e.kind; const detail = e.kind === "replaced" ? `${e.oldTabId}->${e.newTabId}` : (e.name ?? e.url ?? ""); const via = e.via ? ` (via ${e.via})` : ""; const count = e.toolchangeEvents == null ? "" : ` [toolchange events: ${e.toolchangeEvents}]`; console.log(`${e.ts ?? new Date().toISOString()} ${prefix} ${detail}${via}${count}`); };
  const connect = async ({ reconnect }) => {
    const first = await request("watch_start", { tabId: watchedTabId });
    if (!reconnect) { reportTab(first); console.log(`Watching tab ${first.tabId}; mechanism: ${JSON.stringify(first.mechanism ?? first.error ?? {})}; toolchange events: ${first.toolchangeEvents ?? 0}`); }
    watchedTabId = first.tabId;
    sub = await relay("subscribe", { tabId: first.tabId }, { caller: "cli" }, { subscribe: true, onEvent });
    return { closed: new Promise((resolve) => sub.socket.once("close", resolve)) };
  };
  const onState = (s) => { const ts = new Date().toISOString(); if (s.state === "disconnected") console.log(`${ts} bridge disconnected; reconnecting`); else if (s.state === "reconnected") console.log(`${ts} bridge reconnected; watching tab ${watchedTabId}`); else if (s.state === "retrying" && s.attempt === 1) console.log(`${ts} waiting for bridge (${s.error})`); };
  const done = () => { stopped = true; sub?.close(); process.exit(0); };
  process.on("SIGINT", done);
  if (seconds > 0) setTimeout(done, seconds * 1000);
  await superviseSubscription({ connect, onState, isStopped: () => stopped });
}
async function cmdOpen() { const url = args.positionals[0]; if (!url) die("usage: secret-menu open <url> [--tab N] [--new]", 2); if (!flag("--new") && !flag("--force") && (tabId() == null || !isOpenedBySecretMenu(loadOpened(OPENED_TABS_PATH), tabId()))) die("Not navigating a tab Secret Menu did not open. Use --new for a fresh tab, or --tab N for one of Secret Menu's tabs (--force to override).", 3); const data = await request("open_tab", { url, tabId: tabId(), new: flag("--new") }); if (flag("--new")) recordOpened(OPENED_TABS_PATH, data.tabId ?? data.tab?.id, { url, by: "cli open" }); const waited = flag("--wait-tools") ? await waitTools(data.tabId) : null; reportTab(data); if (flag("--json")) output(waited ? { ...data, tools: waited.tools, waitedMs: waited.waitedMs, ...(waited.timedOut ? { timedOut: true } : {}) } : data, true); else console.log(`${data.tabId}\t${data.url}`); }
async function cmdReload() { const data = await request("reload_tab", { tabId: tabId() }); const waited = flag("--wait-tools") ? await waitTools(data.tabId) : null; reportTab(data); if (flag("--json")) output(waited ? { ...data, tools: waited.tools, waitedMs: waited.waitedMs, ...(waited.timedOut ? { timedOut: true } : {}) } : data, true); else console.log(`${data.tabId}\t${data.url}`); }
async function cmdClose() {
  const opened = loadOpened(OPENED_TABS_PATH);
  if (flag("--mine")) {
    const mine = (await request("list_tabs")).filter((t) => isOpenedBySecretMenu(opened, t.tabId));
    for (const t of mine) { await request("close_tab", { tabId: t.tabId }); console.log(`Closed tab ${t.tabId}\t${String(t.title ?? "").slice(0, 80)}`); }
    forgetOpened(OPENED_TABS_PATH, Object.keys(opened));
    if (!mine.length) console.log("No tabs opened by Secret Menu are open");
    return;
  }
  const id = tabId(); if (id == null) die("usage: secret-menu close --tab N [--force] | secret-menu close --mine   (close never guesses the active tab)", 2);
  if (!isOpenedBySecretMenu(opened, id) && !flag("--force")) die(`Not closing tab ${id}: Secret Menu did not open it. Add --force if you are sure.`, 3);
  const data = await request("close_tab", { tabId: id }); forgetOpened(OPENED_TABS_PATH, [id]); reportTab(data); if (flag("--json")) output(data, true); else console.log(`${data.tabId}\t${data.url}`);
}
function cmdLog() { const n = Number(option("--n", 20)); for (const row of readAudit(AUDIT_PATH).slice(-n)) console.log(flag("--redact") ? redactText(JSON.stringify(row)) : JSON.stringify(row)); }
const SIGN_IN_ERROR = /login_required|sign-?in[- _]required|not (logged|signed) in|unauthori[sz]ed|requires? (a )?(login|sign-?in)|please (log|sign) in/i;
async function openForExplain(url) { // `secret-menu explain <url>`: open a new tab (waiting up to 30 s for a just-launched bridge), then explain it
  let last; for (let i = 0; i < 30; i++) { try { const o = await request("open_tab", { url, new: true }); recordOpened(OPENED_TABS_PATH, o.tabId ?? o.tab?.id, { url, by: "cli explain" }); console.error(`Opened tab ${o.tabId} for ${url} (close it with: secret-menu close --tab ${o.tabId})`); return o.tabId; } catch (e) { last = e; await delay(1000); } }
  die(`Could not open ${url}: ${last?.message ?? last}. Is the Secret Menu Chrome running? Try: secret-menu launch`);
}
async function cmdExplain() {
  const target = args.positionals[0]; if (target && !/^https?:\/\//i.test(target)) die("usage: secret-menu explain [<http(s) url> | --tab N] [--json] [--seed-allowlist]", 2);
  const data = await waitTools(target ? await openForExplain(target) : tabId());
  const tab = { id: data.tab?.id ?? data.tabId, url: data.tab?.url ?? data.url, title: data.tab?.title ?? data.title };
  let origin = null; try { origin = new URL(tab.url).origin; } catch {}
  const policy = readPolicyOrDie(); const site = origin ? siteFor(policy, origin) : null;
  const probes = {};
  if (flag("--probe")) for (const tool of data.tools ?? []) {
    const props = Object.keys(parseSchema(tool.inputSchema).properties ?? {});
    if (tool.annotations?.readOnlyHint !== true || props.length || classifyTool(tool).kind !== "read") continue;
    if (decideTool(policy, origin, tool).action !== "run") { probes[tool.name] = { outcome: "skipped (site policy)", called: false }; continue; }
    try { const text = JSON.stringify(unwrapResult(await request("call_page_tool", { tabId: tab.id, name: tool.name, arguments: {} }, "explain-probe"))); probes[tool.name] = { outcome: SIGN_IN_ERROR.test(text) ? "needs sign-in" : "worked", called: true }; }
    catch (e) { probes[tool.name] = { outcome: SIGN_IN_ERROR.test(String(e?.message)) ? "needs sign-in" : "error", called: true }; }
  }
  const cli = resolve(process.cwd()) === root ? "./bin/secret-menu" : join(root, "bin", "secret-menu");
  const report = explainTools(data.tools ?? [], { url: tab.url, tabId: tab.id, title: tab.title, cli, policySite: site, probes, waitedMs: data.waitedMs, page: normalizePageContext(data.page, tab) });
  let seed = null;
  if (flag("--seed-allowlist")) {
    if (!origin) die("Cannot seed an allowlist: the tab has no web origin", 2);
    seed = { origin, ...seedCandidates(report) };
    const strict = flag("--strict") ? true : undefined;
    if (seed.add.length || strict) { const next = addToPolicy(policy, origin, seed.add, { strict }); savePolicy(POLICY_PATH, next); appendAudit(AUDIT_PATH, { ts: new Date().toISOString(), caller: "cli", method: "site_policy", origin, policy: next.sites[origin], via: "explain --seed-allowlist" }); seed.mode = next.sites[origin].mode; }
    else seed.mode = site?.mode ?? null;
  }
  try { cacheExplain(DATA_HOME, report); } catch {}
  if (flag("--json")) return output({ ...report, ...(seed ? { seed } : {}) }, true);
  console.log(renderExplain(report));
  if (seed) {
    console.log(`\nAllowlist (${POLICY_PATH}) for ${origin}${seed.mode ? `, mode ${seed.mode}` : ""}:`);
    console.log(`  added: ${seed.add.join(", ") || "(nothing new)"}`);
    if (seed.already.length) console.log(`  already allowed: ${seed.already.join(", ")}`);
    if (seed.skip.length) console.log(`  not added: ${seed.skip.map((x) => `${x.name} (${x.why})`).join(", ")}`);
  }
}
function readPolicyOrDie() { try { return loadPolicy(POLICY_PATH); } catch (e) { die(e.message, 2); } }
function cmdSafety() { const want = args.positionals[0]; const policy = readPolicyOrDie(); if (want === "on" || want === "off") { const next = { ...policy, safety: { guard: want === "on", audit: want === "on" } }; savePolicy(POLICY_PATH, next); if (want === "on") appendAudit(AUDIT_PATH, { ts: new Date().toISOString(), caller: "cli", method: "safety", safety: next.safety }); console.log(`safety ${want}: guard ${next.safety.guard ? "on" : "off"}, audit ${next.safety.audit ? "on" : "off"} (${POLICY_PATH})`); return; } if (want && want !== "status") die("usage: secret-menu safety [on|off|status]", 2); console.log(`guard ${policy.safety.guard ? "on" : "off"} (${policy.safety.guard ? "tools the page doesn't mark read-only need your approval" : "calls run; your agent's own approval UI decides"})\naudit ${policy.safety.audit ? "on" : "off"}\nsite entries: ${Object.keys(policy.sites).length} (checked by secret-menu call, MCP call_page_tool and explain --probe, even with safety off)`); }
function cmdSites() { const policy = readPolicyOrDie(); if (flag("--json")) return output(policy, true); const rows = Object.entries(policy.sites); if (!rows.length) return console.log(`No site policies (${POLICY_PATH})`); console.log(`Site policies (${POLICY_PATH})`); for (const [origin, site] of rows) console.log(`${origin}\t${site.mode}\t${site.allow.join(", ") || "(no tools)"}`); }
function cmdAllow() { const [origin, ...tools] = args.positionals; if (!origin) die("usage: secret-menu allow <origin> [tool...] [--strict | --no-strict]", 2); let key; try { key = normalizeOrigin(origin); } catch (e) { die(e.message, 2); } const strict = flag("--strict") ? true : flag("--no-strict") ? false : undefined; const policy = addToPolicy(readPolicyOrDie(), key, tools, { strict }); savePolicy(POLICY_PATH, policy); appendAudit(AUDIT_PATH, { ts: new Date().toISOString(), caller: "cli", method: "site_policy", origin: key, policy: policy.sites[key] }); const site = policy.sites[key]; console.log(`${key}\t${site.mode}\t${site.allow.join(", ") || "(no tools)"}`); }
function cmdDisallow() { const [origin, ...tools] = args.positionals; if (!origin) die("usage: secret-menu disallow <origin> [tool...]   (no tools removes the site entry)", 2); let key; try { key = normalizeOrigin(origin); } catch (e) { die(e.message, 2); } const policy = removeFromPolicy(readPolicyOrDie(), key, tools); savePolicy(POLICY_PATH, policy); appendAudit(AUDIT_PATH, { ts: new Date().toISOString(), caller: "cli", method: "site_policy", origin: key, policy: policy.sites[key] ?? null }); console.log(policy.sites[key] ? `${key}\t${policy.sites[key].mode}\t${policy.sites[key].allow.join(", ") || "(no tools)"}` : `${key}\tremoved`); }
function cmdVerify() { const rows = readAudit(AUDIT_PATH), anchor = readAuditAnchor(AUDIT_PATH), v = verifyAudit(rows, anchor); if (!v.ok && v.truncated) die(`BAD: audit log truncated (expected seq ${v.expectedSeq}, found ${v.foundSeq})`, 6); if (!v.ok) die(`BAD: first invalid audit record seq ${v.seq}`, 6); if (rows.length && !anchor) console.error("warning: audit head anchor is missing; tail truncation cannot be detected"); console.log(`OK: ${v.count} audit records`); }
function cmdApprovals() { for (const x of listApprovals(APPROVALS_DIR).filter((a) => a.status === "pending")) console.log(`${x.id}\t${x.createdAt}\t${x.origin}\t${x.tool}\t${JSON.stringify(x.args)}`); }
function decide(status) { const id = args.positionals[0]; if (!id) die(`usage: secret-menu ${status === "approved" ? "approve" : "deny"} <id>`, 2); const rec = readApproval(APPROVALS_DIR, id); if (!rec) die(`Approval not found: ${id}`, 2); if (Date.now() - Date.parse(rec.createdAt) > 600000) die(`Approval expired: ${id}`, 2); if (rec.status !== "pending") die(`Approval is already ${rec.status}`, 2); rec.status = status; rec.decidedAt = new Date().toISOString(); writeApproval(APPROVALS_DIR, rec); appendAudit(AUDIT_PATH, { ts: rec.decidedAt, caller: "cli", method: "approval_decision", approvalId: rec.id, tool: rec.tool, origin: rec.origin, argsDigest: sha256(canonical(rec.args)), decision: status }); console.log(`${status}: ${id}`); }
function cmdServe() {
  const dir = join(root, "test", "fixtures"), rawPort = option("--port", "8765"), port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) die("--port must be an integer from 1 to 65535", 2);
  if (!existsSync(dir)) die("test fixtures are missing; this package cannot serve its test pages", 1);
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  const server = createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); const path = resolve(dir, `.${pathname === "/" ? "/churn.html" : pathname}`), rel = relative(dir, path); if (rel.startsWith("..") || rel.startsWith("/") || !existsSync(path)) { res.writeHead(404).end("not found"); return; } res.setHeader("content-type", mime[extname(path)] ?? "application/octet-stream"); res.end(readFileSync(path)); });
  server.on("error", (error) => { console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use. Stop the other server or run: secret-menu serve --port <n>` : `Could not serve fixtures: ${error.message}`); process.exit(1); });
  server.listen(port, "127.0.0.1", () => console.log(`Serving http://127.0.0.1:${port}/`));
}
function extensionIdOrDie() { try { return resolveExtensionIds({ flags: options("--extension-id") }); } catch (e) { die(e.message, 2); } }
function cmdSetup() {
  const ext = extensionIdOrDie();
  let res; try { res = setup({ dataHome: DATA_HOME, extensionIds: ext.ids, browsers: options("--browser") }); } catch (e) { die(e.message); }
  console.log("Secret Menu setup: connecting the extension in your Chrome to this computer.");
  for (const browser of res.browsers) console.log(`  browser   ${browser.browser}: ${browser.hostsDir}`);
  for (const [what, path] of res.actions) console.log(`  ${what.padEnd(9)} ${path}`);
  if (res.replaced) console.log(`  note: the manifest used to point at ${res.replaced}; it now points at the launcher above.`);
  console.log(`  extensions ${ext.ids.join(", ")} (${ext.source})\n\n${nextStepText()}`);
}
async function cmdDoctor() {
  const ext = extensionIdOrDie();
  let checks; try { checks = await doctor({ dataHome: DATA_HOME, socketPath: SOCKET_PATH, extensionIds: ext.ids, browsers: options("--browser") }); } catch (e) { die(e.message); }
  for (const c of checks) { console.log(`${c.ok ? "ok  " : "FAIL"} ${c.label}`); if (!c.ok) console.log(`     fix: ${c.fix}`); }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `${failed} check${failed === 1 ? "" : "s"} failed.` : "All checks passed.");
  if (failed) process.exitCode = 1;
}
function cmdUninstall() {
  let res; try { res = uninstall({ dataHome: DATA_HOME, browsers: options("--browser") }); } catch (e) { die(e.message); }
  for (const [what, path] of res.actions) console.log(`  ${what.padEnd(9)} ${path}`);
  console.log(`Left in place: your data in ${DATA_HOME} and anything secret-menu launch wrote.`);
}
async function main() {
  const specs = {
    launch: { booleans: ["--headless"] },
    open: { values: ["--tab", "--timeout", "--settle"], booleans: ["--new", "--json", "--wait-tools", "--force"] },
    stop: { values: ["--timeout"], booleans: ["--force", "--kill"] },
    mcp: { values: ["--allow-tools"], booleans: ["--read-only"] },
    reload: { values: ["--tab", "--timeout", "--settle"], booleans: ["--json", "--wait-tools"] },
    close: { values: ["--tab"], booleans: ["--json", "--mine", "--force"] },
    tools: { values: ["--tab", "--timeout", "--settle"], booleans: ["--json", "--wait-tools"] },
    form: { values: ["--tab"] },
    call: { values: ["--tab", "--args", "--timeout", "--arg"], booleans: ["--yes", "--json"], multi: ["--arg"] },
    watch: { values: ["--tab", "--for"] },
    log: { values: ["--n"], booleans: ["--redact"] },
    sites: { booleans: ["--json"] },
    explain: { values: ["--tab", "--timeout", "--settle"], booleans: ["--json", "--seed-allowlist", "--strict", "--probe"] },
    allow: { booleans: ["--strict", "--no-strict"] },
    setup: { values: ["--extension-id", "--browser"], multi: ["--extension-id", "--browser"] },
    doctor: { values: ["--extension-id", "--browser"], multi: ["--extension-id", "--browser"] },
    uninstall: { values: ["--browser"], multi: ["--browser"] },
    serve: { values: ["--port"] },
  };
  if (command == null || command === "--help" || command === "-h") { console.log(USAGE); return; }
  if (command === "help") { const target = commandArgv[0]; if (!target) { console.log(USAGE); return; } const detail = commandHelp(target); if (!detail) die(USAGE, 2); console.log(`${TAGLINE}\n${detail}`); return; }
  if (commandArgv.includes("--help") || commandArgv.includes("-h")) { const detail = commandHelp(command); if (!detail) die(USAGE, 2); console.log(`${TAGLINE}\n${detail}`); return; }
  try { args = parseArgs(commandArgv, specs[command] ?? {}); }
  catch (error) { die(`${error.message}\nusage: secret-menu ${command ?? "<command>"} [options]`, 2); }
  switch (command) { case "launch": return cmdLaunch(); case "stop": return cmdStop(); case "status": return cmdStatus(); case "host-pid": return cmdHostPid(); case "tabs": return cmdTabs(); case "open": return cmdOpen(); case "reload": return cmdReload(); case "close": return cmdClose(); case "tools": return cmdTools(); case "form": return cmdForm(); case "call": return cmdCall(); case "watch": return cmdWatch(); case "log": return cmdLog(); case "sites": return cmdSites(); case "safety": return cmdSafety(); case "explain": return cmdExplain(); case "allow": return cmdAllow(); case "disallow": return cmdDisallow(); case "verify": return cmdVerify(); case "mcp": return import("../host/mcp-server.mjs"); case "approvals": return cmdApprovals(); case "approve": return decide("approved"); case "deny": return decide("denied"); case "serve": return cmdServe(); case "setup": return cmdSetup(); case "doctor": return cmdDoctor(); case "uninstall": return cmdUninstall(); default: die(USAGE, 2); }
}
main().catch((e) => die(e?.message ?? String(e)));

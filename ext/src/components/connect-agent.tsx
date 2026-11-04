import { useId, useState } from "react";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyLabel } from "@/components/copy-label";

export const SETUP_COMMAND = "npx secret-menu setup";
export const MCP_COMMAND = "npx -y secret-menu mcp";
const COMMAND_LABELS = ["Copy setup command", "Copy MCP command"];

// "Connect your agent": the one-time step that installs the native host. Shown, never as an error,
// wherever a feature needs the bridge (Discover's local index, hand-off to an agent).
export function ConnectAgent({ why, compact = false }: { why?: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const stepsId = useId();
  return (
    <section role="status" aria-label="Connect your agent" data-testid="connect-agent" data-compact={compact ? "true" : undefined} className={compact ? "rounded-lg border p-2 text-sm" : "space-y-2 rounded-lg border p-3 text-sm"}>
      {compact ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 font-medium"><Plug className="size-4 flex-none" aria-hidden="true" /> <span>Your agent needs a one-time setup on this computer before this prompt will work.</span></div>
          <Button size="xs" variant="ghost" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={stepsId}>{expanded ? "Hide steps" : "Show steps"}</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 font-semibold"><Plug className="size-4" aria-hidden="true" /> Connect your agent</div>
      )}
      {!compact && <p className="text-muted-foreground">{why}</p>}
      {(!compact || expanded) && <ol id={compact ? stepsId : undefined} className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>
          <div>In a terminal, run:</div>
          <CommandRow command={SETUP_COMMAND} label="Copy setup command" />
        </li>
        <li>
          <div>Paste the config that setup prints into your agent's MCP settings (for example Claude Desktop → Settings → Developer → Edit Config, or Cursor → Settings → MCP). Its command is:</div>
          <CommandRow command={MCP_COMMAND} label="Copy MCP command" />
        </li>
        <li>Reopen this page.</li>
      </ol>}
    </section>
  );
}

function CommandRow({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return <div className="flex flex-wrap items-center gap-2">
    <code className="min-w-0 max-w-full flex-1 select-all break-all rounded border bg-code px-2 py-1 font-mono text-[12px] text-code-foreground">{command}</code>
    <Button size="xs" variant="outline" onClick={copy} aria-label={label} title={label}><CopyLabel copied={copied} label={label} sizeLabels={COMMAND_LABELS} /></Button>
  </div>;
}

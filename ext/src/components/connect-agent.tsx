import { useState } from "react";
import { Check, Copy, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SETUP_COMMAND = "npx secret-menu setup";

// "Connect your agent": the one-time step that installs the native host. Shown, never as an error,
// wherever a feature needs the bridge (Discover's local index, hand-off to an agent).
export function ConnectAgent({ why }: { why: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(SETUP_COMMAND); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <section role="status" aria-label="Connect your agent" data-testid="connect-agent" className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold"><Plug className="size-4" aria-hidden="true" /> Connect your agent</div>
      <p className="text-muted-foreground">{why}</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>
          <span>In a terminal, run </span><code className="rounded border bg-code px-1 py-px font-mono text-[12px] text-code-foreground">{SETUP_COMMAND}</code>
          <Button size="icon-xs" variant="ghost" className="ml-1 align-middle" onClick={copy} aria-label="Copy setup command" title="Copy setup command">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</Button>
        </li>
        <li>Add <code className="font-mono text-[12px]">npx -y secret-menu mcp</code> as an MCP server in your agent. Setup prints the exact config.</li>
        <li>Reopen this page.</li>
      </ol>
    </section>
  );
}

export type NoToolsReason = "insecure" | "no-webmcp" | "no-tools";

function isLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

export function noToolsReason(input: { secureContext?: boolean; modelContext?: boolean; tools?: number; url?: string }): NoToolsReason | null {
  if (input.secureContext === false) return "insecure";
  if (input.secureContext === undefined && input.url) {
    try {
      const parsed = new URL(input.url);
      if (parsed.protocol === "http:" && !isLocalhost(parsed.hostname)) return "insecure";
    } catch {}
  }
  if (input.modelContext === false) return "no-webmcp";
  if (input.modelContext !== undefined && input.tools === 0) return "no-tools";
  return null;
}

export const WEBMCP_FLAG_URL = "chrome://flags/#enable-webmcp-testing";

export async function openWebmcpFlag(create: (props: { url: string }) => Promise<unknown>): Promise<"opened" | "failed"> {
  try {
    await create({ url: WEBMCP_FLAG_URL });
    return "opened";
  } catch {
    return "failed";
  }
}

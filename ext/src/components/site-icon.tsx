import { useState } from "react";
import { cn } from "@/lib/utils";
import { bare } from "@/lib/pages";

// The tab's favicon when Chrome has one, else a letter tile. Decorative: the host is always shown as text.
export function SiteIcon({ host, src, size = "md" }: { host: string; src?: string; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const box = size === "sm" ? "size-7 rounded-md text-[13px]" : "size-9 rounded-lg text-[15px]";
  if (src && !broken && !src.startsWith("chrome://")) {
    return (
      <div className={cn("flex flex-none items-center justify-center border bg-white", box)} aria-hidden="true">
        <img src={src} alt="" className="size-5" onError={() => setBroken(true)} data-testid="site-favicon" />
      </div>
    );
  }
  return (
    <div className={cn("flex flex-none items-center justify-center bg-secondary font-bold text-secondary-foreground", box)} aria-hidden="true" data-testid="site-letter">
      {(bare(host)[0] ?? "?").toUpperCase()}
    </div>
  );
}

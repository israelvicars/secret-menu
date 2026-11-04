import { useState } from "react";
import { cn } from "@/lib/utils";
import { Mark } from "@/components/mark";

// The tab's favicon when Chrome has one, else the Secret Menu mark. Decorative: the host is always shown as text.
export function SiteIcon({ host, src, size = "md" }: { host: string; src?: string; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const box = size === "sm" ? "size-7 rounded-md text-[13px]" : "size-9 rounded-lg text-[15px]";
  if (src && !broken && !src.startsWith("chrome://")) {
    return (
      <div className={cn("flex flex-none items-center justify-center border bg-white dark:bg-white/90", box)} aria-hidden="true">
        <img src={src} alt="" className="size-5" onError={() => setBroken(true)} data-testid="site-favicon" />
      </div>
    );
  }
  return <div className={cn("flex flex-none items-center justify-center overflow-hidden", box)} aria-hidden="true" data-testid="site-mark"><Mark className="size-full" /></div>;
}

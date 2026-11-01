import { MARK_SVG } from "@/lib/mark";
import { cn } from "@/lib/utils";

// The 🗝️ mark, decorative: the text next to it ("Secret Menu") carries the name, so the emoji never reaches the AX tree.
export function Mark({ className }: { className?: string }) {
  return <span aria-hidden="true" data-testid="sm-mark" className={cn("inline-block size-3.5 flex-none [&>svg]:block [&>svg]:size-full", className)} dangerouslySetInnerHTML={{ __html: MARK_SVG }} />;
}

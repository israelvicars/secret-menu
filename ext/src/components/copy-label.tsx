import { Check, Copy } from "lucide-react";

export function CopyLabel({ copied, label, iconClassName, sizeLabels }: { copied: boolean; label: string; iconClassName?: string; sizeLabels?: string[] }) {
  return (
    <span className="inline-grid">
      <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1 ${copied ? "" : "invisible"}`} aria-hidden={!copied}>
        <Check className={iconClassName} aria-hidden="true" />
        Copied
      </span>
      <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1 ${copied ? "invisible" : ""}`} aria-hidden={copied}>
        <Copy className={iconClassName} aria-hidden="true" />
        {label}
      </span>
      {sizeLabels?.map((sizeLabel) => (
        <span key={sizeLabel} className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1 invisible" aria-hidden="true">
          <Copy className={iconClassName} aria-hidden="true" />
          {sizeLabel}
        </span>
      ))}
    </span>
  );
}

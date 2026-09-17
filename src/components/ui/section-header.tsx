import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// design/01: card section titles are 15px/600, with an optional 12px
// muted subtitle line and a right-aligned action slot (e.g. an "Edit"
// button, a filter). Used inside CardHeader-style contexts across the
// admin dashboard and detail pages.
export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <div className="text-[15px] font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

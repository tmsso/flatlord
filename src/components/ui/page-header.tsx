import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// design/04: the admin shell's top bar — 19px/600 title, an optional
// slot for a MonthPicker (or any other control) right next to it, and a
// flex-spacer pushing anything else (search, actions) to the far right.
export function PageHeader({
  title,
  monthPicker,
  actions,
  className,
}: {
  title: ReactNode;
  monthPicker?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3.5 border-b border-border bg-card px-6 py-3.5", className)}>
      <h1 className="text-[19px] font-semibold">{title}</h1>
      {monthPicker}
      <div className="flex-1" />
      {actions}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EffectiveDatedColumn {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
}

export interface EffectiveDatedRow {
  id: string;
  cells: Record<string, ReactNode>;
  /** Highlights the row as the currently-in-force one (design/01: inset
   * accent edge + tinted background + an "active" pill next to the first
   * cell's content). */
  isCurrent?: boolean;
}

// design/01 "Effective-dated table — rates with history": current row
// highlighted with an accent edge, past rows muted, 36px-equivalent
// density rows. Used for charge_schedules-style effective-dated data
// (rate history, field-policy history, anything with valid_from/valid_to).
export function EffectiveDatedTable({
  columns,
  rows,
  currentLabel,
  emptyLabel,
}: {
  columns: EffectiveDatedColumn[];
  rows: EffectiveDatedRow[];
  currentLabel: string;
  emptyLabel: string;
}) {
  const gridTemplate = columns.map(() => "1fr").join(" ");

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div
        className="grid gap-3 border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((col) => (
          <div key={col.key} className={col.align === "right" ? "text-right" : undefined}>
            {col.header}
          </div>
        ))}
      </div>
      {rows.length === 0 && <div className="px-3 py-3 text-[13px] text-muted-foreground">{emptyLabel}</div>}
      {rows.map((row, i) => (
        <div
          key={row.id}
          className={cn(
            "grid items-center gap-3 px-3 py-2 text-[13px] tabular-nums",
            i < rows.length - 1 && "border-b border-border",
            row.isCurrent
              ? "bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))] shadow-[inset_3px_0_0_var(--primary)]"
              : "text-muted-foreground",
          )}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {columns.map((col, colIdx) => (
            <div key={col.key} className={col.align === "right" ? "text-right" : undefined}>
              {colIdx === 0 && row.isCurrent ? (
                <span className="font-medium text-foreground">
                  {row.cells[col.key]}
                  <span className="ml-1.5 inline-flex items-center rounded-full border border-primary px-1.75 text-[11px] font-medium text-primary">
                    {currentLabel}
                  </span>
                </span>
              ) : colIdx === columns.length - 1 && row.isCurrent ? (
                <span className="font-semibold text-foreground">{row.cells[col.key]}</span>
              ) : (
                row.cells[col.key]
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

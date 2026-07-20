"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter } from "next-intl";

function addMonths(periodMonth: string, delta: number): string {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

// Controlled month picker (value/onChange), locale-aware label via
// next-intl's useFormatter — matches design doc's prev/next-arrows +
// centered month-year label component.
export function MonthPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const format = useFormatter();
  const label = format.dateTime(new Date(`${value}T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="inline-flex items-center rounded-md border border-input bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(addMonths(value, -1))}
        className="flex h-9 w-8 items-center justify-center border-r border-border text-foreground hover:bg-muted"
        aria-label="Previous month"
      >
        <ChevronLeft className="size-4" />
      </button>
      <div className="min-w-28 px-3 text-center text-[13px] font-medium">{label}</div>
      <button
        type="button"
        onClick={() => onChange(addMonths(value, 1))}
        className="flex h-9 w-8 items-center justify-center border-l border-border text-foreground hover:bg-muted"
        aria-label="Next month"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

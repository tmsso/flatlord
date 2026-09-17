"use client";

import type { ReactNode } from "react";

// design/04 dashboard header: bordered pill, 30x32px chevron buttons,
// centered 92px-min label. Purely presentational — callers own the actual
// month state and label formatting (locale-aware "MMMM yyyy").
export function MonthPicker({
  label,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
  previousLabel,
  nextLabel,
}: {
  label: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-input bg-card">
      <button
        type="button"
        aria-label={previousLabel}
        onClick={onPrevious}
        disabled={previousDisabled}
        className="flex h-8 w-[30px] items-center justify-center border-r border-border text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
        ‹
      </button>
      <div className="min-w-[92px] px-3 text-center text-[13px] font-medium tabular-nums">{label}</div>
      <button
        type="button"
        aria-label={nextLabel}
        onClick={onNext}
        disabled={nextDisabled}
        className="flex h-8 w-[30px] items-center justify-center border-l border-border text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}

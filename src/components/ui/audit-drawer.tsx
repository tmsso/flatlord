"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface AuditDrawerEntry {
  id: string;
  /** Rendered as-is — caller composes "Emma Admin changed: electricity rate". */
  summary: ReactNode;
  oldValue?: ReactNode;
  newValue?: ReactNode;
  at: ReactNode;
  approvedBy?: ReactNode;
}

// design/01 "Audit-history drawer": who / when / before -> after, opened
// from a ghost "History" button on any editable entity. No dedicated
// Sheet primitive exists in this codebase yet, so this reuses Dialog
// (Base UI) repositioned as a right-edge panel rather than a centered
// modal — same overlay/focus-trap/escape-to-close behaviour, different
// placement.
export function AuditDrawer({
  trigger,
  title,
  entries,
  emptyLabel,
}: {
  trigger: ReactNode;
  title: ReactNode;
  entries: AuditDrawerEntry[];
  emptyLabel: string;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>{trigger}</DialogTrigger>
      <DialogContent
        className="top-0 right-0 left-auto h-full max-h-none w-full max-w-sm translate-x-0 translate-y-0 rounded-none rounded-l-xl border-l border-border p-0 data-open:animate-in data-open:slide-in-from-right data-open:zoom-in-100 data-closed:animate-out data-closed:slide-out-to-right data-closed:zoom-out-100 sm:max-w-sm"
        showCloseButton
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-4 py-3">
            <DialogTitle>{title}</DialogTitle>
          </div>
          <div className="flex-1 overflow-y-auto">
            {entries.length === 0 && <p className="px-4 py-4 text-[13px] text-muted-foreground">{emptyLabel}</p>}
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex gap-2.5 px-3.5 py-2.5 ${i < entries.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="flex-1">
                  <div className="text-[13px]">{entry.summary}</div>
                  {(entry.oldValue !== undefined || entry.newValue !== undefined) && (
                    <div className="mt-0.75 text-[13px] tabular-nums">
                      {entry.oldValue !== undefined && (
                        <span className="text-muted-foreground line-through">{entry.oldValue}</span>
                      )}
                      {entry.oldValue !== undefined && entry.newValue !== undefined && (
                        <span className="mx-1 text-muted-foreground">→</span>
                      )}
                      {entry.newValue !== undefined && <b className="font-semibold">{entry.newValue}</b>}
                    </div>
                  )}
                  {entry.approvedBy && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-success">{entry.approvedBy}</div>
                  )}
                </div>
                <div className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">{entry.at}</div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

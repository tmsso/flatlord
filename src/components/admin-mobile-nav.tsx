"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { SidebarNav, type NavItem } from "@/components/nav-link";

// Admin navigation below `md` (BACKLOG B-19): the sidebar is hidden there,
// so a menu button opens the same SidebarNav in a left drawer. Built on
// Base UI's Dialog for focus trapping, Escape and backdrop-to-close.
// Clicking any nav link closes it, so the next page isn't covered.
export function AdminMobileNav({ items, menuLabel, closeLabel }: { items: NavItem[]; menuLabel: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="flex size-10 items-center justify-center rounded-md border border-border bg-card md:hidden"
        aria-label={menuLabel}
      >
        <Menu className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 md:hidden" />
        <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col gap-3 border-r border-border bg-card p-3 shadow-md outline-none md:hidden">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <DialogPrimitive.Title className="text-[15px] font-semibold">Flatlord</DialogPrimitive.Title>
            <DialogPrimitive.Close className="flex size-10 items-center justify-center rounded-md hover:bg-muted" aria-label={closeLabel}>
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <SidebarNav items={items} rootHref="/dashboard" />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

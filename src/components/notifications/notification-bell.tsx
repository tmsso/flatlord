"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { markNotificationRead } from "@/server/notifications/mark-notification-read";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// Deep-link targets exist for request/notice/statement, (owner-only)
// tenancy, and (tenant-only) inventory_reconfirmation today —
// inventory/field_edit notifications render without a link. The tenancy
// link backs Phase 4a's statement_draft_blocked alert (owner → the
// tenancy page); the inventory_reconfirmation link sends the tenant to
// their home dashboard, where the reconfirmation checklist lives (there's
// no per-campaign tenant page).
function entityHref(row: NotificationRow, role: "owner" | "tenant"): string | null {
  if (!row.entityId) return null;
  if (row.entityType === "request") return role === "owner" ? `/requests/${row.entityId}` : `/home/requests/${row.entityId}`;
  if (row.entityType === "notice") return role === "owner" ? `/notices/${row.entityId}` : `/home/notices/${row.entityId}`;
  if (row.entityType === "statement") return role === "owner" ? `/statements/${row.entityId}` : `/home/statements/${row.entityId}`;
  if (row.entityType === "tenancy") return role === "owner" ? `/tenancies/${row.entityId}` : null;
  if (row.entityType === "inventory_reconfirmation") return role === "tenant" ? "/home" : null;
  return null;
}

// A plain toggled panel rather than the Base UI Menu primitive
// (components/ui/dropdown-menu.tsx) — deliberately, to avoid its
// render-prop/nativeButton composition quirks (see project memory on
// Base UI Button/Select gotchas) for a component this simple.
export function NotificationBell({ notifications, role }: { notifications: NotificationRow[]; role: "owner" | "tenant" }) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  function handleSelect(row: NotificationRow) {
    setOpen(false);
    if (row.readAt) return;
    startTransition(async () => {
      await markNotificationRead(row.id);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      {/* Icon + label from sm up; icon-only below (the tenant header at
          390px can't fit the Hungarian label). Accessible name unchanged. */}
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-label={t("bellLabel")} className="max-sm:size-8 max-sm:px-0">
        <Bell className="size-4" />
        <span className="max-sm:sr-only">{t("bellLabel")}</span>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="ml-1">
            {unreadCount}
          </Badge>
        )}
      </Button>
      {open && (
        <>
          <button type="button" aria-label={t("close")} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          {/* Below sm the panel is pinned to the viewport (full-width under the
              header) — anchored to the bell it ran off the left edge at 390px. */}
          <div className="z-50 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-md max-sm:fixed max-sm:inset-x-3 max-sm:top-16 sm:absolute sm:right-0 sm:mt-2 sm:w-80">
            {notifications.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {notifications.map((n) => {
                  const href = entityHref(n, role);
                  const body = (
                    <div className={`rounded-md p-2 text-sm ${!n.readAt ? "bg-muted" : ""}`}>
                      <p className="font-medium">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">{format.dateTime(new Date(n.createdAt))}</p>
                    </div>
                  );
                  return href ? (
                    <Link key={n.id} href={href} onClick={() => handleSelect(n)}>
                      {body}
                    </Link>
                  ) : (
                    <button key={n.id} type="button" className="w-full text-left" onClick={() => handleSelect(n)}>
                      {body}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

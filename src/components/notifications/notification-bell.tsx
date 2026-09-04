"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { markNotificationRead } from "@/server/notifications/mark-notification-read";
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

// Deep-link targets only exist for request/notice/statement today (see
// migration 0022's comment) — inventory/field_edit notifications render
// without a link.
function entityHref(row: NotificationRow, role: "owner" | "tenant"): string | null {
  if (!row.entityId) return null;
  if (row.entityType === "request") return role === "owner" ? `/requests/${row.entityId}` : `/home/requests/${row.entityId}`;
  if (row.entityType === "notice") return role === "owner" ? `/notices/${row.entityId}` : `/home/notices/${row.entityId}`;
  if (row.entityType === "statement") return role === "owner" ? `/statements/${row.entityId}` : `/home/statements/${row.entityId}`;
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
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-label={t("bellLabel")}>
        {t("bellLabel")}
        {unreadCount > 0 && (
          <Badge variant="destructive" className="ml-1">
            {unreadCount}
          </Badge>
        )}
      </Button>
      {open && (
        <>
          <button type="button" aria-label={t("close")} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-md">
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

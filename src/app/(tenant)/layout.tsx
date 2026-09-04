import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { createClient } from "@/lib/supabase/server";

const tabKeys = [
  "home",
  "meters",
  "statements",
  "requests",
  "notices",
  "settings",
] as const;

export default async function TenantLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("nav");
  const supabase = await createClient();

  // self_scope_notifications RLS already restricts this to the caller's
  // own rows — no extra filter needed here. Logged, not thrown, on error:
  // this renders in every page's shell, so a broken notifications query
  // should degrade to an empty bell, not blank the whole layout.
  const { data: notificationRows, error: notificationsError } = await supabase
    .from("notifications")
    .select("id, title, body, entity_type, entity_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (notificationsError) console.error("[TenantLayout] notifications query failed:", notificationsError.message);
  const notifications = (notificationRows ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    entityType: n.entity_type,
    entityId: n.entity_id,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4">
        <span className="text-[15px] font-semibold">Flatlord</span>
        <div className="flex items-center gap-2">
          <NotificationBell notifications={notifications} role="tenant" />
          <LocaleSwitcher />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-4 pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-border bg-card grid grid-cols-6">
        {tabKeys.map((key) => (
          <Link
            key={key}
            href={
              key === "home"
                ? "/home"
                : key === "statements"
                  ? "/home/statements"
                  : key === "meters"
                    ? "/home/meters"
                    : key === "settings"
                      ? "/home/settings"
                      : key === "requests"
                        ? "/home/requests"
                        : key === "notices"
                          ? "/home/notices"
                          : "#"
            }
            className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-11 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t(key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

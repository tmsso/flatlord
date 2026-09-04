import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { createClient } from "@/lib/supabase/server";

const navKeys = [
  "dashboard",
  "properties",
  "tenancies",
  "persons",
  "statements",
  "meters",
  "requests",
  "notices",
  "settings",
] as const;

export default async function AdminLayout({
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
  if (notificationsError) console.error("[AdminLayout] notifications query failed:", notificationsError.message);
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
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border bg-card p-4 hidden md:flex md:flex-col gap-1">
        <div className="px-2 pb-4 text-[15px] font-semibold">Flatlord</div>
        {navKeys.map((key) => (
          <Link
            key={key}
            href={
              key === "dashboard"
                ? "/dashboard"
                : key === "settings"
                  ? "/settings"
                  : key === "statements"
                    ? "/statements"
                    : key === "meters"
                      ? "/meters"
                      : key === "requests"
                        ? "/requests"
                        : key === "notices"
                          ? "/notices"
                          : key === "properties"
                          ? "/properties"
                          : key === "tenancies"
                            ? "/tenancies"
                            : key === "persons"
                              ? "/persons"
                              : "#"
            }
            className="rounded-md px-2.5 h-9 flex items-center text-[13px] font-medium text-foreground hover:bg-muted"
          >
            {t(key)}
          </Link>
        ))}
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-end gap-2 px-4">
          <NotificationBell notifications={notifications} role="owner" />
          <LocaleSwitcher />
          <ThemeToggle />
          <SignOutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Settings } from "lucide-react";
import { TabBarNav, type NavItem } from "@/components/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { createClient } from "@/lib/supabase/server";

const tabSpec = [
  { key: "home", href: "/home", icon: "home" },
  { key: "meters", href: "/home/meters", icon: "gauge" },
  // "payments", not "statements": the design's tab bar (design/02) uses the
  // shorter label, and "Elszámolások" clips at 390px in a six-tab bar.
  { key: "payments", href: "/home/statements", icon: "file" },
  { key: "requests", href: "/home/requests", icon: "message" },
  { key: "notices", href: "/home/notices", icon: "bell" },
] as const;
// Settings lives in the header (gear), not the tab bar: five tabs is the
// most a 390px bar fits without clipping Hungarian labels (design/02 also
// shows five). The tab bar stays the primary navigation.

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

  const tabItems: NavItem[] = tabSpec.map((n) => ({ href: n.href, icon: n.icon, label: t(n.key) }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4">
        <span className="text-[15px] font-semibold">Flatlord</span>
        <div className="flex items-center gap-2">
          <NotificationBell notifications={notifications} role="tenant" />
          <LocaleSwitcher />
          <ThemeToggle />
          <Link
            href="/home/settings"
            aria-label={t("settings")}
            title={t("settings")}
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
          >
            <Settings className="size-4" />
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-4 pb-24">{children}</main>
      <TabBarNav items={tabItems} rootHref="/home" />
    </div>
  );
}

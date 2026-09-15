import { getTranslations } from "next-intl/server";
import { SidebarNav, type NavItem } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { createClient } from "@/lib/supabase/server";

// Order follows the design's sidebar (design/04): overview first, the
// monthly workflow (statements, meters) next, then the entity/admin pages.
const navSpec = [
  { key: "dashboard", href: "/dashboard", icon: "dashboard" },
  { key: "statements", href: "/statements", icon: "file" },
  { key: "meters", href: "/meters", icon: "gauge" },
  { key: "properties", href: "/properties", icon: "building" },
  { key: "tenancies", href: "/tenancies", icon: "key" },
  { key: "persons", href: "/persons", icon: "users" },
  { key: "requests", href: "/requests", icon: "message" },
  { key: "notices", href: "/notices", icon: "bell" },
  { key: "settings", href: "/settings", icon: "settings" },
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

  const navItems: NavItem[] = navSpec.map((n) => ({ href: n.href, icon: n.icon, label: t(n.key) }));

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border bg-card p-3 hidden md:flex md:flex-col gap-3">
        <div className="flex items-center gap-2 px-2 pt-1 pb-2">
          {/* Logo per design/README.md ("C5 sheltered free mark"): white-in-teal tile. */}
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg viewBox="0 0 28 28" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7.5 5.6q6.5-3.8 13 0" />
              <path d="M8 13.8L14 8.4l6 5.4" />
              <path d="M10.2 13.3v4.4h7.6v-4.4" />
              <path d="M7.5 22.4q6.5 3.8 13 0" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold">Flatlord</span>
        </div>
        <SidebarNav items={navItems} rootHref="/dashboard" />
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

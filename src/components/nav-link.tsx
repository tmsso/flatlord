"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  FileText,
  Gauge,
  Home,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Shared "where am I" affordance for both shells (design/README.md: nav
// items carry an icon; the current section is visibly highlighted, not
// just default-link-styled — the owner's 2026-08-03 wayfinding feedback).
// Client component only because active-state needs usePathname(); the
// layouts stay server components and just render a list of these. Icons
// are referenced by name, not component: a React component (a function)
// can't cross the Server → Client Component boundary as a prop, so the
// lookup happens on this side of it.
const icons = {
  bell: Bell,
  building: Building2,
  file: FileText,
  gauge: Gauge,
  home: Home,
  key: KeyRound,
  dashboard: LayoutDashboard,
  message: MessageSquare,
  settings: Settings,
  users: Users,
} as const;

export type NavIcon = keyof typeof icons;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

function isActive(pathname: string, href: string, rootHref: string) {
  // The shell root ("/dashboard", "/home") must only match exactly —
  // otherwise "/home" would light up on every tenant page.
  if (href === rootHref) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ items, rootHref }: { items: NavItem[]; rootHref: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const active = isActive(pathname, href, rootHref);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md border border-transparent px-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-primary/25 bg-primary/10 text-primary"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBarNav({ items, rootHref }: { items: NavItem[]; rootHref: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 grid border-t border-border bg-card shadow-md"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const active = isActive(pathname, href, rootHref);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium leading-none",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";

const navKeys = [
  "dashboard",
  "properties",
  "tenancies",
  "statements",
  "meters",
  "requests",
  "settings",
] as const;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("nav");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border bg-card p-4 hidden md:flex md:flex-col gap-1">
        <div className="px-2 pb-4 text-[15px] font-semibold">Flatlord</div>
        {navKeys.map((key) => (
          <Link
            key={key}
            href={key === "dashboard" ? "/dashboard" : "#"}
            className="rounded-md px-2.5 h-9 flex items-center text-[13px] font-medium text-foreground hover:bg-muted"
          >
            {t(key)}
          </Link>
        ))}
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-end gap-2 px-4">
          <LocaleSwitcher />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

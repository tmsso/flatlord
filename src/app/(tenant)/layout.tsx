import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";

const tabKeys = [
  "home",
  "meters",
  "statements",
  "requests",
  "settings",
] as const;

export default async function TenantLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("nav");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4">
        <span className="text-[15px] font-semibold">Flatlord</span>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-4 pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-border bg-card grid grid-cols-5">
        {tabKeys.map((key) => (
          <Link
            key={key}
            href={key === "home" ? "/home" : "#"}
            className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-11 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t(key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

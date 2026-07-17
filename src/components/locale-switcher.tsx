"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { setLocale } from "@/server/locale/set-locale";
import { locales, type Locale } from "@/i18n/config";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-md border border-input overflow-hidden">
      {locales.map((code, i) => (
        <button
          key={code}
          type="button"
          disabled={isPending}
          onClick={() => handleSelect(code)}
          className={cn(
            "px-2.5 h-9 text-[13px] font-medium uppercase",
            i > 0 && "border-l border-border",
            code === locale
              ? "bg-primary/[0.14] text-primary"
              : "bg-card text-foreground hover:bg-muted",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

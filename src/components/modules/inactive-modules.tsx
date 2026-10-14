"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";
import { setModuleEnabled } from "@/server/modules/set-module-enabled";
import type { OptionalModule } from "@/lib/modules";

// D-33: switched-off modules sit in a collapsed group at the bottom of the
// owner's menu, one click from being switched on.
export function InactiveModules({ modules }: { modules: readonly OptionalModule[] }) {
  const t = useTranslations("modules");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (modules.length === 0) return null;

  function enable(module: OptionalModule) {
    startTransition(async () => {
      try {
        await setModuleEnabled({ module, enabled: true });
        toast.success(t("switchedOn", { module: t(`name_${module}`) }));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <details className="group mt-auto rounded-md border border-border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        {t("inactiveTitle", { count: modules.length })}
      </summary>
      <ul className="flex flex-col gap-0.5 px-1.5 pb-1.5">
        {modules.map((module) => (
          <li key={module}>
            <button
              type="button"
              disabled={isPending}
              onClick={() => enable(module)}
              title={t("enableHint")}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
            >
              <span>{t(`name_${module}`)}</span>
              <Plus className="size-3.5 text-muted-foreground" aria-label={t("enableHint")} />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

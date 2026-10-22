"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setModuleEnabled } from "@/server/modules/set-module-enabled";
import { OPTIONAL_MODULES, type OptionalModule } from "@/lib/modules";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// B-45 / D-33: the owner's own module switches. Off hides a module (nav,
// pages, tenant view, its reminders); its data is kept.
export function ModuleSettings({ enabled }: { enabled: readonly OptionalModule[] }) {
  const t = useTranslations("modules");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle(module: OptionalModule, checked: boolean) {
    startTransition(async () => {
      try {
        await setModuleEnabled({ module, enabled: checked });
        toast.success(checked ? t("switchedOn", { module: t(`name_${module}`) }) : t("switchedOff", { module: t(`name_${module}`) }));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        {OPTIONAL_MODULES.map((module) => (
          <div key={module} className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={`module-${module}`}>{t(`name_${module}`)}</Label>
              <span className="text-xs text-muted-foreground">{t(`desc_${module}`)}</span>
            </div>
            <Switch
              id={`module-${module}`}
              checked={enabled.includes(module)}
              disabled={isPending}
              onCheckedChange={(checked) => handleToggle(module, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

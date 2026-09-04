"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setNotificationPreference } from "@/server/notifications/set-notification-preference";
import type { NotificationCategory } from "@/lib/notifications/notification-categories";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function NotificationPreferences({
  categories,
  prefs,
}: {
  categories: readonly NotificationCategory[];
  prefs: Record<string, { email?: boolean } | undefined>;
}) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle(category: NotificationCategory, checked: boolean) {
    startTransition(async () => {
      try {
        await setNotificationPreference({ category, email: checked });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("preferencesTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t("preferencesHint")}</p>
        {categories.map((category) => (
          <div key={category} className="flex items-center justify-between">
            <Label htmlFor={`pref-${category}`}>{t(`category_${category}`)}</Label>
            <Switch
              id={`pref-${category}`}
              checked={prefs[category]?.email !== false}
              disabled={isPending}
              onCheckedChange={(checked) => handleToggle(category, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

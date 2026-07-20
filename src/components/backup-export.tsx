"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function BackupExport() {
  const t = useTranslations("backup");
  const [dataOnly, setDataOnly] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="text-sm font-semibold">{t("heading")}</div>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex items-center gap-2">
        <Checkbox
          id="backup-data-only"
          checked={dataOnly}
          onCheckedChange={(checked) => setDataOnly(checked === true)}
        />
        <Label htmlFor="backup-data-only">{t("dataOnlyLabel")}</Label>
      </div>
      <Button
        size="sm"
        className="w-fit"
        nativeButton={false}
        render={<a href={`/api/admin/backup?dataOnly=${dataOnly ? "1" : "0"}`} />}
      >
        {t("download")}
      </Button>
    </div>
  );
}

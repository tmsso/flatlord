"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { generateDeclaration } from "@/server/documents/generate-declaration";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface OccupantOption {
  personId: string;
  name: string;
}

// Generates the address-registration/accommodation-provider consent
// declaration (ROADMAP Phase 2 item 5) and saves it straight into this
// tenancy's attachments panel — see generate-declaration.ts.
export function DeclarationGenerator({ tenancyId, occupants }: { tenancyId: string; occupants: OccupantOption[] }) {
  const t = useTranslations("documents");
  const router = useRouter();
  const [occupantId, setOccupantId] = useState(occupants[0]?.personId ?? "");
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!occupantId) return;
    startTransition(async () => {
      try {
        await generateDeclaration({ tenancyId, occupantPersonId: occupantId });
        toast.success(t("generated"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  if (occupants.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("addressRegistrationDescription")}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="declarationOccupant">{t("occupantLabel")}</Label>
          <Select value={occupantId} onValueChange={(v) => v && setOccupantId(v)}>
            <SelectTrigger id="declarationOccupant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {occupants.map((o) => (
                <SelectItem key={o.personId} value={o.personId}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={handleGenerate} disabled={isPending} className="self-start">
          {t("generate")}
        </Button>
      </CardContent>
    </Card>
  );
}

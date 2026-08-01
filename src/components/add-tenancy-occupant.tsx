"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addTenancyOccupant } from "@/server/tenancies/add-tenancy-occupant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const relationships = ["co_occupant", "guest"] as const;
const registrationTypes = ["main_address", "temporary", "casual", "owner_agent"] as const;

export function AddTenancyOccupant({ tenancyId, persons }: { tenancyId: string; persons: { id: string; name: string }[] }) {
  const t = useTranslations("tenancies");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<(typeof relationships)[number]>("co_occupant");
  const [registrationType, setRegistrationType] = useState<string | null>(null);
  const [moveIn, setMoveIn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setError(null);
    startTransition(async () => {
      try {
        await addTenancyOccupant({
          tenancyId,
          personId,
          relationship,
          registrationType: registrationType as "main_address" | "temporary" | "casual" | "owner_agent" | null,
          moveIn: moveIn || null,
        });
        toast.success(tc("save"));
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addOccupant")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addOccupant")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occupantPersonId">{t("occupantPersonLabel")}</Label>
            <Select value={personId ?? undefined} onValueChange={setPersonId}>
              <SelectTrigger id="occupantPersonId" className="w-full">
                <SelectValue placeholder={t("tenantPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {persons.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="relationship">{t("relationshipLabel")}</Label>
            <Select value={relationship} onValueChange={(v) => setRelationship(v as (typeof relationships)[number])}>
              <SelectTrigger id="relationship" className="w-full">
                <SelectValue>{(v: string) => t(`relationship_${v}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {relationships.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`relationship_${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occupantRegistrationType">{t("registrationTypeLabel")}</Label>
            <Select value={registrationType ?? "none"} onValueChange={(v) => setRegistrationType(v === "none" ? null : v)}>
              <SelectTrigger id="occupantRegistrationType" className="w-full">
                <SelectValue>{(v: string) => (v === "none" ? t("registrationTypeNone") : t(`registrationType_${v}`))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("registrationTypeNone")}</SelectItem>
                {registrationTypes.map((rt) => (
                  <SelectItem key={rt} value={rt}>
                    {t(`registrationType_${rt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="moveIn">{t("moveInLabel")}</Label>
            <Input id="moveIn" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending || !personId}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

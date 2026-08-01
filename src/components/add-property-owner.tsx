"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addPropertyOwner } from "@/server/properties/add-property-owner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function AddPropertyOwner({ propertyId, persons }: { propertyId: string; persons: { id: string; name: string }[] }) {
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [percentage, setPercentage] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setError(null);
    startTransition(async () => {
      try {
        await addPropertyOwner({ propertyId, personId, percentage: Number(percentage) });
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
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addCoOwner")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addCoOwner")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ownerPersonId">{t("ownerPersonLabel")}</Label>
            <Select value={personId ?? undefined} onValueChange={setPersonId}>
              <SelectTrigger id="ownerPersonId" className="w-full">
                <SelectValue placeholder={t("ownerNone")} />
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
            <Label htmlFor="percentage">{t("percentageLabel")}</Label>
            <Input id="percentage" type="number" min={1} max={100} value={percentage} onChange={(e) => setPercentage(e.target.value)} />
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

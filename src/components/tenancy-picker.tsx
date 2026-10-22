"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { TenancyOption } from "@/lib/tenancies/list-active-tenancies";

// B-51: switches the page's tenancy via ?tenancy=, keeping the other query
// params (e.g. the dashboard's ?month=). Renders nothing for a single
// tenancy — the common case shouldn't gain a control it can't use.
export function TenancyPicker({ options, selectedId }: { options: TenancyOption[]; selectedId: string | null }) {
  const t = useTranslations("tenancyPicker");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (options.length < 2) return null;

  function handleChange(id: string | null) {
    if (!id) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tenancy", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="tenancyPicker" className="text-sm text-muted-foreground">
        {t("label")}
      </Label>
      <Select
        value={selectedId ?? undefined}
        onValueChange={handleChange}
        items={options.map((o) => ({ value: o.id, label: o.label }))}
      >
        <SelectTrigger id="tenancyPicker" className="min-w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

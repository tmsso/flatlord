import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadOffboarding } from "@/server/offboarding/load-offboarding";
import { listActiveTenancies } from "@/lib/tenancies/list-active-tenancies";
import { OffboardingChecklist } from "@/components/offboarding/offboarding-checklist";
import { Card } from "@/components/ui/card";

// B-43 offboarding checklist. ?tenancy= picks the tenancy (the tenancy
// page's "Offboard tenant" button links here); without one, the owner
// picks from their active tenancies.
export default async function OffboardingPage({ searchParams }: { searchParams: Promise<{ tenancy?: string }> }) {
  const { tenancy: tenancyId } = await searchParams;
  const supabase = await createClient();

  if (!tenancyId) {
    const t = await getTranslations("offboarding");
    const options = await listActiveTenancies(supabase);
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-sm text-muted-foreground">{options.length ? t("pickTenancy") : t("noActiveTenancy")}</p>
          <ul className="flex flex-col gap-1">
            {options.map((o) => (
              <li key={o.id}>
                <Link href={`/offboarding?tenancy=${o.id}`} className="text-sm underline">
                  {o.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  // A malformed id would fail the uuid cast in Postgres — treat as not found.
  if (!/^[0-9a-f-]{36}$/i.test(tenancyId)) notFound();
  const data = await loadOffboarding(supabase, tenancyId);
  if (!data) notFound();

  return (
    <div className="p-6">
      <OffboardingChecklist data={data} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}

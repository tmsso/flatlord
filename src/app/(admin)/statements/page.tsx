import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StatementsList } from "@/components/statements-list";

export default async function AdminStatementsPage() {
  const t = await getTranslations("statements");
  const supabase = await createClient();

  // owner_scope_* RLS already limits reads to the caller's own properties;
  // the persons join relies on owner_scope_persons being unconditional for
  // any owner (verified during planning), so the tenant name column is
  // never silently blank.
  const { data: statements } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status, due_date, total, tenancies(primary_tenant_id, persons(given_name, family_name))")
    .order("period_month", { ascending: false });

  const { data: tenancies } = await supabase
    .from("tenancies")
    .select("id, due_day")
    .eq("status", "active")
    .limit(1);
  const activeTenancyId = tenancies?.[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <StatementsList
        activeTenancyId={activeTenancyId}
        today={new Date().toISOString().slice(0, 10)}
        statements={(statements ?? []).map((s) => {
          const tenancy = Array.isArray(s.tenancies) ? s.tenancies[0] : s.tenancies;
          const person = tenancy && (Array.isArray(tenancy.persons) ? tenancy.persons[0] : tenancy.persons);
          return {
            id: s.id,
            periodMonth: s.period_month,
            status: s.status,
            dueDate: s.due_date,
            total: s.total,
            tenantName: person ? `${person.given_name} ${person.family_name}` : "—",
          };
        })}
      />
    </div>
  );
}

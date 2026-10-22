import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StatementsList } from "@/components/statements-list";
import { listActiveTenancies, pickTenancy } from "@/lib/tenancies/list-active-tenancies";

export default async function AdminStatementsPage({ searchParams }: { searchParams: Promise<{ tenancy?: string }> }) {
  const { tenancy: requestedTenancyId } = await searchParams;
  const t = await getTranslations("statements");
  const supabase = await createClient();

  // owner_scope_* RLS already limits reads to the caller's own properties;
  // the persons join relies on owner_scope_persons being unconditional for
  // any owner (verified during planning), so the tenant name column is
  // never silently blank.
  // voided_at excluded (BACKLOG.md B-05): a discarded draft shouldn't
  // linger in the list — see discard-draft-statement.ts.
  const { data: statements } = await supabase
    .from("statements")
    .select(
      "id, tenancy_id, period_month, status, due_date, issued_at, total, tenancies(primary_tenant_id, persons(given_name, family_name))",
    )
    .is("voided_at", null)
    .order("period_month", { ascending: false });

  // B-51: the list stays unfiltered (ended tenancies' history included);
  // the picker only chooses which tenancy "Create draft" targets.
  const tenancyOptions = await listActiveTenancies(supabase);
  const activeTenancyId = pickTenancy(tenancyOptions, requestedTenancyId)?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <StatementsList
        activeTenancyId={activeTenancyId}
        tenancyOptions={tenancyOptions}
        today={new Date().toISOString().slice(0, 10)}
        statements={(statements ?? []).map((s) => {
          const tenancy = Array.isArray(s.tenancies) ? s.tenancies[0] : s.tenancies;
          const person = tenancy && (Array.isArray(tenancy.persons) ? tenancy.persons[0] : tenancy.persons);
          return {
            id: s.id,
            periodMonth: s.period_month,
            status: s.status,
            dueDate: s.due_date,
            issuedAt: s.issued_at,
            total: s.total,
            tenantName: person ? `${person.given_name} ${person.family_name}` : "—",
          };
        })}
      />
    </div>
  );
}

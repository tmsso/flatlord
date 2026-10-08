import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { TenantStatementsList } from "@/components/tenant-statements-list";

export default async function TenantStatementsPage() {
  const t = await getTranslations("statements");
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id")
    .eq("primary_tenant_id", profile.personId)
    .eq("status", "active")
    .maybeSingle();

  // RLS already scopes statements to the caller's own tenancy — the
  // tenancy_id filter here is belt-and-suspenders, not the only guard.
  // Drafts excluded (B-26): the tenant only ever sees issued statements.
  // tenant_scope_statements RLS (0026) enforces the same as a backstop.
  // Voided rows are always discarded drafts (B-05), so this covers them
  // too; the voided_at filter stays for clarity.
  const { data: statements } = tenancy
    ? await supabase
        .from("statements")
        .select("id, period_month, status, due_date, issued_at, total")
        .eq("tenancy_id", tenancy.id)
        .is("voided_at", null)
        .neq("status", "draft")
        .order("period_month", { ascending: false })
    : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <TenantStatementsList
        today={new Date().toISOString().slice(0, 10)}
        statements={(statements ?? []).map((s) => ({
          id: s.id,
          periodMonth: s.period_month,
          status: s.status,
          dueDate: s.due_date,
          issuedAt: s.issued_at,
          total: s.total,
        }))}
      />
    </div>
  );
}

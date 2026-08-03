import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { buildAmountDueMessage } from "@/lib/notifications/amount-due-message";

// Single source of truth for "what does the amount-due message for this
// statement say" — called from both the statement detail page (to build
// the wa.me link, a plain server-rendered href) and the send-email action
// (to build what actually gets emailed). Keeping one function means the
// two channels can never drift out of sync with each other.
//
// Returns null (never throws) for "nothing outstanding" — an issued
// statement can legitimately have a zero/negative remaining balance (a
// tracked-only month, or an overpayment), and the page.tsx call site is
// an unguarded server-component render: a throw there would 500 the
// whole statement page instead of just hiding the send buttons. The
// send action treats null as its own error instead.
export async function resolveAmountDueContext(supabase: SupabaseClient, statementId: string) {
  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status, due_date, total, currency")
    .eq("id", statementId)
    .single();
  if (statementError) throw new Error(statementError.message);
  if (statement.status === "draft") throw new Error("Statement must be issued before it can be sent");
  if (!statement.due_date) throw new Error("Statement has no due date");

  // For a partially_paid statement, the message must state what's still
  // owed, not the original total — otherwise a tenant who already paid
  // part of it gets told they owe more than they actually do.
  const { data: paymentRows, error: paymentsError } = await supabase
    .from("payments")
    .select("amount")
    .eq("statement_id", statementId);
  if (paymentsError) throw new Error(paymentsError.message);
  const paidSum = (paymentRows ?? []).reduce((sum, p) => sum + p.amount, 0);
  const remaining = statement.total - paidSum;
  if (remaining <= 0) return null;

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("primary_tenant_id, property_id")
    .eq("id", statement.tenancy_id)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);

  const { data: tenant, error: tenantError } = await supabase
    .from("persons")
    .select("given_name, contact_email, phone")
    .eq("id", tenancy.primary_tenant_id)
    .single();
  if (tenantError) throw new Error(tenantError.message);

  const { data: property } = await supabase
    .from("properties")
    .select("payment_instructions")
    .eq("id", tenancy.property_id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("person_id", tenancy.primary_tenant_id)
    .eq("role", "tenant")
    .maybeSingle();
  const locale = isLocale(profile?.locale) ? profile.locale : defaultLocale;

  const numberLocale = locale === "hu" ? "hu-HU" : "en-US";
  const amount = new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency: statement.currency,
    maximumFractionDigits: 0,
  }).format(remaining);
  const dueDate = new Intl.DateTimeFormat(numberLocale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${statement.due_date}T00:00:00Z`),
  );
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/home/statements/${statement.id}`;

  const messages = await loadMessages(locale);
  const { subject, body } = buildAmountDueMessage({
    locale,
    messages,
    tenantName: tenant.given_name,
    amount,
    dueDate,
    paymentInstructions: property?.payment_instructions ?? null,
    portalUrl,
  });

  return {
    subject,
    body,
    tenantEmail: tenant.contact_email as string | null,
    tenantPhone: tenant.phone as string | null,
  };
}

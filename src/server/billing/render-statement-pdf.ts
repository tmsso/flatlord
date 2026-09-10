import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, defaultLocale } from "@/i18n/config";
import { StatementDocument, type StatementPdfLineItem } from "@/lib/documents/statement-template";

// Loads one statement (+ tenancy / property / parties / line items /
// payments) through the caller's RLS-scoped client and renders it to a
// PDF buffer. Shared by the admin and tenant PDF route handlers — RLS is
// what scopes visibility (owner → owned property, tenant → own tenancy);
// a caller who may not see the statement simply gets no row and a 404.
//
// Returns null for "not found / not visible" so the route can 404 cleanly
// rather than 500. Throws only on an unexpected query error.

function groupOf(li: { adjustment_id: string | null; meter_id: string | null }): StatementPdfLineItem["group"] {
  if (li.adjustment_id != null) return "adjustments";
  if (li.meter_id != null) return "metered";
  return "fixed";
}

export async function renderStatementPdf(
  supabase: SupabaseClient,
  statementId: string,
): Promise<{ bytes: ArrayBuffer; fileName: string } | null> {
  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status, due_date, total, currency, issued_at")
    .eq("id", statementId)
    .maybeSingle();
  if (statementError) throw new Error(statementError.message);
  if (!statement) return null;

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("id, unit_id, property_id, primary_tenant_id")
    .eq("id", statement.tenancy_id)
    .maybeSingle();
  if (tenancyError) throw new Error(tenancyError.message);
  if (!tenancy) return null;

  const { data: unit } = await supabase
    .from("properties")
    .select("id, name, parent_id, address_line")
    .eq("id", tenancy.unit_id)
    .maybeSingle();
  let propertyName = unit?.name ?? "—";
  let propertyAddress = unit?.address_line ?? null;
  if (!propertyAddress && unit?.parent_id) {
    const { data: parent } = await supabase
      .from("properties")
      .select("name, address_line")
      .eq("id", unit.parent_id)
      .maybeSingle();
    propertyAddress = parent?.address_line ?? null;
    if (propertyName === "—") propertyName = parent?.name ?? "—";
  }

  const { data: paymentInstructionsRow } = await supabase
    .from("properties")
    .select("payment_instructions")
    .eq("id", tenancy.property_id)
    .maybeSingle();

  const { data: tenant } = await supabase
    .from("persons")
    .select("given_name, family_name")
    .eq("id", tenancy.primary_tenant_id)
    .maybeSingle();
  const tenantName = tenant ? `${tenant.given_name} ${tenant.family_name}` : "—";

  const { data: ownershipRows } = await supabase
    .from("property_ownership")
    .select("persons(given_name, family_name)")
    .eq("property_id", tenancy.property_id);
  const landlordNames =
    (ownershipRows ?? [])
      .map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p: any = Array.isArray(row.persons) ? row.persons[0] : row.persons;
        return p ? `${p.given_name} ${p.family_name}` : null;
      })
      .filter(Boolean)
      .join(", ") || "—";

  const { data: lineItemRows } = await supabase
    .from("statement_line_items")
    .select("description, quantity, unit_rate, amount, is_billable, meter_id, adjustment_id, sort_order")
    .eq("statement_id", statementId)
    .order("sort_order");

  const { data: paymentRows } = await supabase
    .from("payments")
    .select("amount, paid_at, method")
    .eq("statement_id", statementId)
    .order("paid_at");

  // Locale from the caller's own profile — an admin exports in their
  // language, a tenant in theirs.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let locale = defaultLocale;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle();
    if (isLocale(profile?.locale)) locale = profile.locale;
  }

  const lineItems: StatementPdfLineItem[] = (lineItemRows ?? []).map((li) => ({
    description: li.description,
    quantity: li.quantity == null ? null : Number(li.quantity),
    unitRate: li.unit_rate == null ? null : Number(li.unit_rate),
    amount: li.amount,
    isBillable: li.is_billable,
    group: groupOf(li),
  }));

  const buffer = await renderToBuffer(
    StatementDocument({
      locale,
      data: {
        periodMonth: statement.period_month,
        status: statement.status,
        issuedAt: statement.issued_at,
        dueDate: statement.due_date,
        total: statement.total,
        currency: statement.currency ?? "HUF",
        propertyName,
        propertyAddress,
        tenantName,
        landlordNames,
        paymentInstructions: paymentInstructionsRow?.payment_instructions ?? null,
        lineItems,
        payments: (paymentRows ?? []).map((p) => ({ amount: p.amount, paidAt: p.paid_at, method: p.method })),
      },
    }),
  );

  // Copy into a freshly-allocated ArrayBuffer — a Node Buffer's backing
  // type (ArrayBufferLike) isn't structurally the DOM ArrayBuffer that
  // File/Blob's BlobPart wants; `new Uint8Array(length)` gives a real one.
  const out = new Uint8Array(buffer.length);
  out.set(buffer);
  const fileName = `statement-${statement.period_month.slice(0, 7)}.pdf`;
  return { bytes: out.buffer, fileName };
}

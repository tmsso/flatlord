import { useFormatter, useTranslations } from "next-intl";

export interface StatementLineItemDisplay {
  id: string;
  description: string;
  quantity: number | null;
  unitRate: number | null;
  amount: number;
  isBillable: boolean;
  chargeScheduleId: string | null;
  meterId: string | null;
  adjustmentId: string | null;
  // D-07 (BACKLOG.md B-07): when this is one of the standard catalog
  // codes, the display label is resolved from the i18n catalog here
  // rather than the stored `description` — historical statements
  // (issued before the bilingual-display fix) snapshot raw machine
  // names into `description` (e.g. "electricity (electricity)") and
  // issued statements are immutable, so this is a render-time fix, never
  // an edit to the stored row. Null for one-off/ad-hoc charge types the
  // admin invented, which have no catalog entry — those keep showing
  // their stored description, same as before.
  chargeTypeCode: string | null;
  // Optional detail (admin statement page, design/05): the readings the
  // metered delta was computed from, the charge type's unit, and the
  // fixed charge's schedule start. Callers that don't load them get the
  // plain "quantity × rate" line.
  fromValue?: number | null;
  toValue?: number | null;
  unit?: string | null;
  validFrom?: string | null;
}

// Keep in sync with messages/{hu,en}.json's statements.chargeType keys —
// only these codes have a catalog entry; anything else (an admin-invented
// ad-hoc charge type) falls back to the stored description.
const STANDARD_CHARGE_TYPE_CODES = new Set(["rent", "common_cost", "electricity", "gas", "water", "internet"]);

// Grouping is derived from which FK the row itself carries — the same
// distinction compute-statement.ts (M4) makes when building these rows,
// so no join to charge_types.kind is needed just to group them (the
// caller does still join charge_types(code) for chargeTypeCode above,
// a different column, for the render-time label resolution).
function groupOf(li: StatementLineItemDisplay): "fixed" | "metered" | "adjustments" {
  if (li.adjustmentId != null) return "adjustments";
  if (li.meterId != null) return "metered";
  return "fixed";
}

// Shared, read-only — used by both admin and tenant statement views so
// the two never drift on how a statement reads (per the M6 plan).
// `layout="flush"` renders group bands + rows edge to edge for placement
// inside a card (admin, design/05); "boxed" (default) gives each group its
// own bordered box (tenant views).
export function StatementLineItemsTable({
  lineItems,
  layout = "boxed",
}: {
  lineItems: StatementLineItemDisplay[];
  layout?: "boxed" | "flush";
}) {
  const t = useTranslations("statements");
  const format = useFormatter();

  const groupOrder = ["fixed", "metered", "adjustments"] as const;
  const groups = groupOrder
    .map((key) => ({ key, items: lineItems.filter((li) => groupOf(li) === key) }))
    .filter((g) => g.items.length > 0);

  function formatAmount(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }
  function formatNumber(n: number) {
    return format.number(n, { maximumFractionDigits: 3 });
  }

  function displayLabel(li: StatementLineItemDisplay): string {
    if (li.chargeTypeCode && STANDARD_CHARGE_TYPE_CODES.has(li.chargeTypeCode)) {
      return t(`chargeType.${li.chargeTypeCode}`);
    }
    return li.description;
  }

  // Units are stored as plain ASCII codes ("m3"); show the proper symbol.
  function unitLabel(unit: string | null | undefined): string {
    return unit === "m3" ? "m³" : (unit ?? "");
  }

  function detail(li: StatementLineItemDisplay): React.ReactNode {
    if (!li.isBillable) return t("trackedOnly");
    if (li.quantity != null && li.unitRate != null) {
      const rate = formatAmount(li.unitRate) + (li.unit ? `/${unitLabel(li.unit)}` : "");
      const delta =
        li.fromValue != null && li.toValue != null
          ? t("readingDelta", {
              from: formatNumber(li.fromValue),
              to: formatNumber(li.toValue),
              quantity: formatNumber(li.quantity),
              unit: unitLabel(li.unit),
            })
          : formatNumber(li.quantity) + (li.unit ? ` ${unitLabel(li.unit)}` : "");
      return (
        <>
          {delta} ×{" "}
          <span className="inline-flex items-center rounded-4xl border border-border px-1.5 text-[11px] text-foreground">
            {rate}
          </span>
        </>
      );
    }
    if (li.validFrom) return t("validFrom", { date: format.dateTime(new Date(`${li.validFrom}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) });
    return null;
  }

  function row(li: StatementLineItemDisplay, bordered: boolean, padX: string) {
    const d = detail(li);
    return (
      <div
        key={li.id}
        className={`flex items-center justify-between gap-3 ${padX} py-2 text-sm ${bordered ? "border-t border-border" : ""} ${!li.isBillable ? "text-muted-foreground" : ""}`}
      >
        <div className="flex-1">
          <span>{displayLabel(li)}</span>
          {d && <span className="text-xs text-muted-foreground tabular-figures"> · {d}</span>}
        </div>
        <div className="tabular-figures font-medium">{li.isBillable ? formatAmount(li.amount) : "—"}</div>
      </div>
    );
  }

  if (layout === "flush") {
    return (
      <div className="flex flex-col">
        {groups.map((group, gi) => (
          <div key={group.key} className={gi > 0 ? "border-t border-border" : ""}>
            <div className="px-[18px] pt-3 pb-1 text-xs font-semibold text-muted-foreground">
              {t(`lineItemGroup.${group.key}`)}
            </div>
            {group.items.map((li, i) => row(li, i > 0, "px-[18px]"))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{t(`lineItemGroup.${group.key}`)}</div>
          <div className="rounded-md border border-border overflow-hidden">
            {group.items.map((li, i) => row(li, i > 0, "px-3"))}
          </div>
        </div>
      ))}
    </div>
  );
}

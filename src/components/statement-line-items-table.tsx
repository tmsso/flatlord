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
}

// Grouping is derived from which FK the row itself carries — the same
// distinction compute-statement.ts (M4) makes when building these rows,
// so no extra join to charge_types.kind is needed just to display them.
function groupOf(li: StatementLineItemDisplay): "fixed" | "metered" | "adjustments" {
  if (li.adjustmentId != null) return "adjustments";
  if (li.meterId != null) return "metered";
  return "fixed";
}

// Shared, read-only — used by both admin and tenant statement views so
// the two never drift on how a statement reads (per the M6 plan).
export function StatementLineItemsTable({ lineItems }: { lineItems: StatementLineItemDisplay[] }) {
  const t = useTranslations("statements");
  const format = useFormatter();

  const groupOrder = ["fixed", "metered", "adjustments"] as const;
  const groups = groupOrder
    .map((key) => ({ key, items: lineItems.filter((li) => groupOf(li) === key) }))
    .filter((g) => g.items.length > 0);

  function formatAmount(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t(`lineItemGroup.${group.key}`)}
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            {group.items.map((li, i) => (
              <div
                key={li.id}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="flex-1">
                  <div>{li.description}</div>
                  {li.quantity != null && li.unitRate != null && (
                    <div className="text-xs text-muted-foreground tabular-figures">
                      {t("quantityAtRate", { quantity: li.quantity, rate: formatAmount(li.unitRate) })}
                    </div>
                  )}
                </div>
                <div className={`tabular-figures font-medium ${!li.isBillable ? "text-muted-foreground" : ""}`}>
                  {li.isBillable ? formatAmount(li.amount) : t("notCharged")}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

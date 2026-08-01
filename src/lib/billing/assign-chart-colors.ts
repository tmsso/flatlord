// Stable color assignment for charge types across BOTH charts (identity
// consistency — CLAUDE.md/dataviz rule: "color follows the entity, never
// its rank"). Never hardcodes a specific charge type name; only uses
// `kind` (a fixed, small enum) to prefer the design's metered vs
// tracked-only slot allocation when there's room for it, falling back to
// a shared overflow list so any real charge_types set degrades
// gracefully rather than cycling hues.
const METERED_SLOTS = ["--chart-1", "--chart-3", "--chart-4"] as const;
const TRACKED_ONLY_SLOTS = ["--chart-2", "--chart-4", "--chart-1"] as const;
const OVERFLOW = "--muted-foreground";

export interface ChargeTypeIdentity {
  id: string;
  kind: "metered" | "tracked_only";
  sortOrder: number;
}

export function assignChartColors(chargeTypes: ChargeTypeIdentity[]): Map<string, string> {
  const metered = chargeTypes.filter((c) => c.kind === "metered").sort((a, b) => a.sortOrder - b.sortOrder);
  const trackedOnly = chargeTypes.filter((c) => c.kind === "tracked_only").sort((a, b) => a.sortOrder - b.sortOrder);

  const map = new Map<string, string>();
  metered.forEach((c, i) => map.set(c.id, i < METERED_SLOTS.length ? `var(${METERED_SLOTS[i]})` : `var(${OVERFLOW})`));
  trackedOnly.forEach((c, i) => map.set(c.id, i < TRACKED_ONLY_SLOTS.length ? `var(${TRACKED_ONLY_SLOTS[i]})` : `var(${OVERFLOW})`));
  return map;
}

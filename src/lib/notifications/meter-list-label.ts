import type { MeterKind } from "@/lib/billing/meter-kind";

// Meter labels are free text and are often generic ("Meter") or repeated
// across meters, which the UI disambiguates with a type icon. A plain-text
// email has no icon, so each label carries its translated type in
// parentheses — unless the label already is that type name.
export function formatMeterList(
  meters: { label: string; kind: MeterKind }[],
  kindLabel: (kind: MeterKind) => string,
): string {
  return meters
    .map(({ label, kind }) => {
      const type = kindLabel(kind);
      return label.trim().toLowerCase() === type.toLowerCase() ? label : `${label} (${type})`;
    })
    .join(", ");
}

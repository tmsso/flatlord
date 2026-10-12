// Meters have no type column: the type is implied by the charge type they
// bill against. Codes are free-form per property ("water", "water_kitchen",
// "electricity", a custom code…), so match by prefix/substring, then fall
// back to the unit — kWh is always electricity, GJ always heat. m³ is
// ambiguous (gas or water), so it doesn't decide on its own.
export const METER_KINDS = ["electricity", "gas", "water", "heat", "other"] as const;
export type MeterKind = (typeof METER_KINDS)[number];

export function meterKind(code?: string | null, unit?: string | null): MeterKind {
  const c = (code ?? "").toLowerCase();
  if (c.includes("water") || c.includes("viz")) return "water";
  if (c.includes("gas") || c.includes("gaz")) return "gas";
  if (c.includes("electric") || c.includes("aram") || c.includes("power")) return "electricity";
  if (c.includes("heat") || c.includes("hot") || c.includes("fut")) return "heat";
  const u = (unit ?? "").toLowerCase();
  if (u === "kwh") return "electricity";
  if (u === "gj" || u === "mj") return "heat";
  return "other";
}

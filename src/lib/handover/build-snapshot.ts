// B-13: pure assembly of a handover snapshot's frozen content, so the rule
// (which items, which meter value) is unit-tested apart from the queries.

export interface SnapshotInventoryItem {
  id: string;
  title: string;
  kind: string;
  ownedBy: string;
  condition: string | null;
  status: string;
  notes: string | null;
  photos: string[]; // storage paths of the item's (non-deleted) attachments
}

export interface SnapshotMeter {
  meterId: string;
  label: string;
  unit: string | null;
  value: number;
  readingDate: string | null; // null when the value is the meter's base value
  source: "reading" | "base";
}

export function buildSnapshotInventory(
  items: { id: string; title: string; kind: string; owned_by: string; condition: string | null; status: string; notes: string | null }[],
  attachments: { entity_id: string; storage_path: string | null }[],
): SnapshotInventoryItem[] {
  const photos = new Map<string, string[]>();
  for (const a of attachments) {
    if (!a.storage_path) continue;
    photos.set(a.entity_id, [...(photos.get(a.entity_id) ?? []), a.storage_path]);
  }
  return items
    .filter((i) => i.status !== "removed")
    .map((i) => ({
      id: i.id,
      title: i.title,
      kind: i.kind,
      ownedBy: i.owned_by,
      condition: i.condition,
      status: i.status,
      notes: i.notes,
      photos: photos.get(i.id) ?? [],
    }));
}

/**
 * Baseline per meter: the latest verified reading on or before `asOf`,
 * otherwise the meter's base value. Meters are those in service on `asOf`
 * (same date window as the meter-entry pages, B-55).
 */
export function buildSnapshotMeters(
  meters: { id: string; label: string; base_value: string | number; installed_at: string; removed_at: string | null; unit: string | null }[],
  verifiedReadings: { meter_id: string; reading_date: string; confirmed_value: string | number | null; created_at: string }[],
  asOf: string,
): SnapshotMeter[] {
  return meters
    .filter((m) => m.installed_at <= asOf && (m.removed_at == null || m.removed_at >= asOf))
    .map((m) => {
      const latest = verifiedReadings
        .filter((r) => r.meter_id === m.id && r.reading_date <= asOf && r.confirmed_value != null)
        .sort((a, b) => (a.reading_date === b.reading_date ? b.created_at.localeCompare(a.created_at) : b.reading_date.localeCompare(a.reading_date)))[0];
      return latest
        ? { meterId: m.id, label: m.label, unit: m.unit, value: Number(latest.confirmed_value), readingDate: latest.reading_date, source: "reading" as const }
        : { meterId: m.id, label: m.label, unit: m.unit, value: Number(m.base_value), readingDate: null, source: "base" as const };
    });
}

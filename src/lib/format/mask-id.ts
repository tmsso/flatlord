// CLAUDE.md §6: "Personal-document numbers masked in UI except admin
// detail views" — this is for the tenant-facing read-only views; admin's
// own person-form.tsx shows values in full, which is the named exception.
export function maskId(value: string | null): string | null {
  if (!value) return value;
  if (value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

// CLAUDE.md §3.5's 3-way switch. Kept in its own module (not
// field-policies.ts) so client components can import the value list
// without pulling in drizzle-orm/pg-core, same reasoning as keeping
// REQUEST_CATEGORIES importable from a plain module in requests.ts (that
// one lives in the schema file itself since it's also used in a CHECK
// constraint string built via drizzle's `sql` tag; field_policies.policy
// has no such constraint, so there's no need to colocate).
export const FIELD_POLICIES = ["read_only", "approval_required", "free"] as const;
export type FieldPolicy = (typeof FIELD_POLICIES)[number];

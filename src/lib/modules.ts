// B-45 / D-33: optional, per-owner switchable modules. Billing, meters,
// contracts and tenancy are core and have no switch. `taxation` is
// accepted by the DB (0033) but not offered until B-44 builds it.
export const OPTIONAL_MODULES = ["inventory", "requests", "notifications"] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];

export type ModuleSet = ReadonlySet<OptionalModule>;

export function toModuleSet(values: readonly string[] | null | undefined): ModuleSet {
  return new Set((values ?? []).filter((v): v is OptionalModule => (OPTIONAL_MODULES as readonly string[]).includes(v)));
}

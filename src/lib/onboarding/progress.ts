// Onboarding wizard progress (B-42). Derived entirely from what exists in
// the database — there is no wizard-state table, so abandoning half-way
// and coming back resumes at the first missing step. Pure for unit tests;
// the facts are loaded by server/onboarding/load-onboarding.ts.

export const ONBOARDING_FLOWS = {
  // first-time owner: everything
  full: ["you", "flat", "billing", "tenant", "rates", "invite"],
  // "Add a flat" on its own
  flat: ["flat", "billing"],
  // "Add a tenant" on an existing flat
  tenant: ["tenant", "rates", "invite"],
} as const;

export type OnboardingFlow = keyof typeof ONBOARDING_FLOWS;
export type OnboardingStep = (typeof ONBOARDING_FLOWS)[OnboardingFlow][number];

export interface OnboardingFacts {
  /** The owner has a real name (an invited owner starts as a bare person, D-38: family name empty). */
  ownNameSet: boolean;
  /** A lettable unit (flat/room) is in focus. */
  hasUnit: boolean;
  /** The unit has ≥1 active charge type and every active metered one has an in-service meter. */
  billingReady: boolean;
  /** A tenancy is in focus. */
  hasTenancy: boolean;
  /** Every active fixed/metered charge type of the unit has a rate on the tenancy. */
  ratesSet: boolean;
  /** The primary tenant can sign in or has a live invite. */
  tenantInvited: boolean;
}

const DONE: Record<OnboardingStep, (f: OnboardingFacts) => boolean> = {
  you: (f) => f.ownNameSet,
  flat: (f) => f.hasUnit,
  billing: (f) => f.hasUnit && f.billingReady,
  tenant: (f) => f.hasTenancy,
  rates: (f) => f.hasTenancy && f.ratesSet,
  invite: (f) => f.hasTenancy && f.tenantInvited,
};

export interface OnboardingProgress {
  steps: { key: OnboardingStep; done: boolean }[];
  /** First incomplete step, or null when the flow is complete. */
  firstOpen: OnboardingStep | null;
}

export function computeProgress(flow: OnboardingFlow, facts: OnboardingFacts): OnboardingProgress {
  const steps = ONBOARDING_FLOWS[flow].map((key) => ({ key, done: DONE[key](facts) }));
  return { steps, firstOpen: steps.find((s) => !s.done)?.key ?? null };
}

/** The step to show: the one asked for (if it belongs to the flow), else the first open one. */
export function resolveStep(flow: OnboardingFlow, requested: string | undefined, progress: OnboardingProgress): OnboardingStep | null {
  const keys = ONBOARDING_FLOWS[flow] as readonly string[];
  if (requested && keys.includes(requested)) return requested as OnboardingStep;
  return progress.firstOpen;
}

export function parseFlow(value: string | undefined): OnboardingFlow {
  return value === "flat" || value === "tenant" ? value : "full";
}

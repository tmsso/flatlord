// Offboarding checklist (B-43). Like onboarding (B-42) there is no wizard
// table: progress is derived from the database, and the only wizard-own
// records — "started on <date>", a skipped step, the handover note — are
// audit_log rows on the tenancy (D-44). Pure for unit tests; facts are
// loaded by server/offboarding/load-offboarding.ts.

export const OFFBOARDING_STEPS = ["end", "requests", "readings", "statement", "deposit", "handover", "access"] as const;
export type OffboardingStep = (typeof OFFBOARDING_STEPS)[number];

/** Steps the owner may explicitly skip (with a note). Starting and ending can't be skipped. */
export const SKIPPABLE_STEPS: readonly OffboardingStep[] = ["requests", "readings", "statement", "deposit", "handover"];

export type StepStatus = "done" | "skipped" | "open";

export interface OffboardingFacts {
  /** Offboarding was started (end date recorded). */
  started: boolean;
  /** Open requests on the tenancy (0 when the requests module is off). */
  openRequests: number;
  /** In-service meters without a verified reading in the end month. */
  metersMissingFinalReading: number;
  /** A live statement for the end month was issued after offboarding started. */
  finalStatementIssued: boolean;
  /** Deposit ledger balance (paid − applied − refunded). */
  depositBalance: number;
  /** Unpaid remainder of issued statements. Settlement means both are zero (D-45). */
  outstandingTotal: number;
  /** A handover note was recorded. */
  handoverRecorded: boolean;
  /** Tenancy status is ended/terminated. */
  tenancyEnded: boolean;
  /** Latest skip/reopen per step from the audit trail. */
  skipped: ReadonlySet<OffboardingStep>;
}

const DONE: Record<OffboardingStep, (f: OffboardingFacts) => boolean> = {
  end: (f) => f.started,
  requests: (f) => f.started && f.openRequests === 0,
  readings: (f) => f.started && f.metersMissingFinalReading === 0,
  statement: (f) => f.started && f.finalStatementIssued,
  deposit: (f) => f.started && f.depositBalance === 0 && f.outstandingTotal === 0,
  handover: (f) => f.started && f.handoverRecorded,
  access: (f) => f.tenancyEnded,
};

export interface OffboardingProgress {
  steps: { key: OffboardingStep; status: StepStatus }[];
  /** Every step before "access" is done or skipped — the tenancy may be ended. */
  readyToEnd: boolean;
  complete: boolean;
}

export function computeOffboardingProgress(facts: OffboardingFacts): OffboardingProgress {
  const steps = OFFBOARDING_STEPS.map((key) => {
    const status: StepStatus = DONE[key](facts)
      ? "done"
      : facts.started && SKIPPABLE_STEPS.includes(key) && facts.skipped.has(key)
        ? "skipped"
        : "open";
    return { key, status };
  });
  const beforeAccess = steps.filter((s) => s.key !== "access");
  return {
    steps,
    readyToEnd: beforeAccess.every((s) => s.status !== "open"),
    complete: steps.every((s) => s.status !== "open"),
  };
}

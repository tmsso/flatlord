// B-53: Next.js redacts thrown server-action messages in production builds,
// so an *expected* failure (a business rule the user can act on) is
// returned as a code instead, and the client maps it to `actionErrors.<code>`
// in the message catalogs. Unexpected failures (DB/RLS errors) still throw;
// the client shows its generic catalog message for those.
export const ACTION_ERRORS = [
  "draftExists",
  "readingBelowPrevious",
  "facilityNeedsOwner",
  "subsetRequiresItems",
  "noItemsInScope",
  "predecessorTenancyMismatch",
  "onlyDraftCanActivate",
  "nothingOutstanding",
  "tenantHasNoEmail",
  "changeAlreadyPending",
  "tenancyNotActive",
  "endBeforeStart",
  "noProRataCredit",
  "offboardingIncomplete",
  "noDepositToApply",
  "requestNotOpen",
] as const;

export type ActionErrorCode = (typeof ACTION_ERRORS)[number];

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: ActionErrorCode };

export const fail = (error: ActionErrorCode) => ({ ok: false as const, error });

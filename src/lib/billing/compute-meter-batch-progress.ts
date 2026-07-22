export interface MeterBatchReadingInput {
  id: string;
  meterId: string;
  status: "submitted" | "verified" | "rejected";
  createdAt: string;
}

export interface MeterBatchProgressResult {
  /** One row per meter — the latest reading, even if a meter has several (e.g. reject → resubmit). */
  latestByMeter: Record<string, MeterBatchReadingInput>;
  verifiedCount: number;
  totalCount: number;
  allVerified: boolean;
}

/**
 * A "batch" (admin queue grouping) isn't a stored entity — it's derived as
 * (tenancy, month), and a meter can have multiple reading rows within one
 * month (reject → resubmit). Dedupes to the latest row per meter by
 * `createdAt` before computing verified/total counts, so a rejected-then-
 * resubmitted meter counts once, as its current state.
 */
export function computeMeterBatchProgress(
  activeMeterIds: string[],
  readings: MeterBatchReadingInput[],
): MeterBatchProgressResult {
  const latestByMeter: Record<string, MeterBatchReadingInput> = {};
  for (const reading of readings) {
    const existing = latestByMeter[reading.meterId];
    if (!existing || reading.createdAt > existing.createdAt) {
      latestByMeter[reading.meterId] = reading;
    }
  }

  const totalCount = activeMeterIds.length;
  const verifiedCount = activeMeterIds.filter((meterId) => latestByMeter[meterId]?.status === "verified").length;

  return {
    latestByMeter,
    verifiedCount,
    totalCount,
    allVerified: totalCount > 0 && verifiedCount === totalCount,
  };
}

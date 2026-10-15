import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Durable per-run record for the daily cron (B-50, table cron_runs, 0036).
// Every write fails open: a missing table (code deployed before its
// migration) or a failed write is logged and the cron carries on exactly
// as before — the run log must never be the reason reminders stop.

export interface PhaseRecord {
  phase: string;
  ms: number;
  result: unknown;
}

export interface CronRunLog {
  phaseDone(record: PhaseRecord): Promise<void>;
  finish(status: "ok" | "failed", error?: string): Promise<void>;
}

export async function startCronRun(service: SupabaseClient, job: string): Promise<CronRunLog> {
  const phases: PhaseRecord[] = [];
  let id: string | null = null;
  const { data, error } = await service.from("cron_runs").insert({ job }).select("id").single();
  if (error || !data) console.error("cron-run-log: start failed (continuing without a run log)", job, error?.message);
  else id = data.id as string;

  async function update(fields: Record<string, unknown>) {
    if (!id) return;
    const { error: updateError } = await service
      .from("cron_runs")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) console.error("cron-run-log: update failed", job, updateError.message);
  }

  return {
    async phaseDone(record) {
      phases.push(record);
      await update({ phases });
    },
    async finish(status, errorMessage) {
      await update({ status, error: errorMessage ?? null, finished_at: new Date().toISOString() });
    },
  };
}

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createDraftStatementCore } from "@/server/billing/create-draft-statement-core";

const CreateDraftStatementSchema = z.object({
  tenancyId: z.string().uuid(),
  periodMonth: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, "periodMonth must be the first day of a month (YYYY-MM-01)"),
});

// Thin "use server" wrapper: validate input, then hand off to the
// client-injectable core with the RLS/cookie client. The cron's
// auto-draft pass (run-statement-auto-draft.ts) calls the same core with
// a service-role client. Authorization is RLS's job
// (owner_insert_statements etc.) — no getUser() call, same as
// revoke-invite.ts.
export async function createDraftStatement(input: { tenancyId: string; periodMonth: string }) {
  const parsed = CreateDraftStatementSchema.parse(input);
  const supabase = await createClient();
  return createDraftStatementCore(supabase, parsed);
}

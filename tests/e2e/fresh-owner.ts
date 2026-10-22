// Dev-only Playwright fixture (long batch 2026-10-15): a fresh owner through
// the real invite path, plus a cleanup that removes everything that owner
// owns or created. Used for ad-hoc verification of owner flows (B-42
// wizard, B-43 later); not part of the nightly smoke. Pass the client from
// helpers.ts devAdmin(), which refuses anything but the dev project.
import type { SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

// The inviting owner: any existing owner person on dev (Emma by default).
export const INVITER_PERSON = process.env.E2E_INVITER_PERSON_ID ?? "35e8f6be-acf7-4862-8e11-affa5d785193";

/** A fresh owner through the real invite path: invite row → createUser → handle_new_user (0034 bare person). */
export async function createFreshOwner(admin: SupabaseClient, tag: string) {
  const email = `pw-${tag}-${Date.now()}@flatlord.test`;
  const { error: inviteError } = await admin.from("invites").insert({
    email,
    token_hash: `pw-${tag}`,
    role: "owner",
    invited_by: INVITER_PERSON,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  if (inviteError) throw inviteError;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = created.user!.id;
  const { data: profile, error: profileError } = await admin.from("profiles").select("person_id").eq("id", userId).single();
  if (profileError) throw profileError;
  return { email, userId, personId: profile!.person_id as string };
}

/** Removes everything a fixture owner owns or created (dev only). Best-effort, logs failures. */
export async function cleanupOwner(admin: SupabaseClient, owner: { email: string; userId: string; personId: string }) {
  const log = (what: string, e: { message: string } | null) => e && console.log("cleanup", what, e.message);
  const { data: own } = await admin.from("property_ownership").select("property_id").eq("person_id", owner.personId);
  const roots = (own ?? []).map((o) => o.property_id as string);
  const { data: props } = await admin.from("properties").select("id").in("root_property_id", roots.length ? roots : ["00000000-0000-0000-0000-000000000000"]);
  const propIds = (props ?? []).map((p) => p.id as string);
  const { data: tens } = await admin.from("tenancies").select("id, primary_tenant_id").in("property_id", roots.length ? roots : ["00000000-0000-0000-0000-000000000000"]);
  const tenIds = (tens ?? []).map((t) => t.id as string);
  const { data: stmts } = await admin.from("statements").select("id").in("tenancy_id", tenIds.length ? tenIds : ["00000000-0000-0000-0000-000000000000"]);
  const stmtIds = (stmts ?? []).map((s) => s.id as string);
  const { data: mgd } = await admin.from("persons").select("id").eq("managed_by_person_id", owner.personId);
  const personIds = [...(mgd ?? []).map((p) => p.id as string), owner.personId];
  // Tenant logins created for managed persons (B-43 offboarding runs).
  const { data: tenantProfiles } = await admin.from("profiles").select("id").in("person_id", personIds).neq("id", owner.userId);
  const tenantUserIds = (tenantProfiles ?? []).map((p) => p.id as string);
  const { data: reqs } = await admin.from("requests").select("id").in("tenancy_id", tenIds.length ? tenIds : ["00000000-0000-0000-0000-000000000000"]);
  const reqIds = (reqs ?? []).map((r) => r.id as string);
  // Issued statements' line items are immutable (trigger, even for the
  // service role), so a run that issued a statement needs a direct dev DB
  // connection to remove them. Dev only: refuses any URL without the dev ref.
  await deleteIssuedLineItems(stmtIds);
  const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
    ["line items", () => admin.from("statement_line_items").delete().in("statement_id", stmtIds)],
    ["deliveries", () => admin.from("statement_deliveries").delete().in("statement_id", stmtIds)],
    ["deposit transactions", () => admin.from("deposit_transactions").delete().in("tenancy_id", tenIds)],
    ["payments", () => admin.from("payments").delete().in("statement_id", stmtIds)],
    ["statements", () => admin.from("statements").delete().in("id", stmtIds)],
    ["adjustments", () => admin.from("adjustments").delete().in("tenancy_id", tenIds)],
    ["request messages", () => admin.from("request_messages").delete().in("request_id", reqIds)],
    ["requests", () => admin.from("requests").delete().in("id", reqIds)],
    ["readings", () => admin.from("meter_readings").delete().in("tenancy_id", tenIds)],
    ["schedules", () => admin.from("charge_schedules").delete().in("tenancy_id", tenIds)],
    ["invites by owner", () => admin.from("invites").delete().eq("invited_by", owner.personId)],
    ["occupants", () => admin.from("tenancy_occupants").delete().in("tenancy_id", tenIds)],
    ["contracts", () => admin.from("contracts").delete().in("tenancy_id", tenIds)],
    ["tenancies", () => admin.from("tenancies").delete().in("id", tenIds)],
    ["meters", () => admin.from("meters").delete().in("unit_id", propIds)],
    ["charge types", () => admin.from("charge_types").delete().in("unit_id", propIds)],
    ["field policies", () => admin.from("field_policies").delete().in("property_id", propIds)],
    ["audit", () => admin.from("audit_log").delete().or(`actor_id.eq.${owner.personId},property_id.in.(${propIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)],
    ["notifications", () => admin.from("notifications").delete().in("recipient_profile_id", [owner.userId, ...tenantUserIds])],
    ["tenant profiles", () => admin.from("profiles").delete().in("id", tenantUserIds.length ? tenantUserIds : ["00000000-0000-0000-0000-000000000000"])],
    ["ownership", () => admin.from("property_ownership").delete().in("property_id", propIds)],
    ["child props", () => admin.from("properties").delete().in("id", propIds).not("parent_id", "is", null)],
    ["props", () => admin.from("properties").delete().in("id", propIds)],
    ["profile", () => admin.from("profiles").delete().eq("id", owner.userId)],
    ["tenant invites", () => admin.from("invites").delete().in("person_id", personIds)],
    ["persons", () => admin.from("persons").delete().in("id", personIds)],
    ["own invite", () => admin.from("invites").delete().eq("email", owner.email)],
  ];
  for (const [what, run] of steps) log(what, (await run()).error);
  for (const id of [...tenantUserIds, owner.userId]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    log("auth user", error);
  }
}

async function deleteIssuedLineItems(statementIds: string[]) {
  if (!statementIds.length) return;
  const url = process.env.E2E_DEV_DB_URL ?? "";
  if (!url.includes("kqrzqbocruwafvuodatb") || url.includes("zarpjgtcwkndtmlnhmdd")) {
    console.log("cleanup: E2E_DEV_DB_URL (dev) not set — issued statements' line items, and the rows that depend on them, stay behind");
    return;
  }
  const sql = postgres(url, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      // Transaction-local: skips the immutability trigger for this delete only.
      await tx`set local session_replication_role = replica`;
      await tx`delete from statement_line_items where statement_id = any(${statementIds})`;
    });
  } catch (e) {
    console.log("cleanup: issued line items", (e as Error).message);
  } finally {
    await sql.end();
  }
}

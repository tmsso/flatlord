import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

// B-49 (0038): the "before user created" Auth hook allows sign-up only for
// an email with a live invite — same rule as handle_new_user. DB-backed
// (CI's real Supabase Postgres).
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });
const TAG = "before-user-hook-test";

afterEach(async () => {
  await sql`delete from invites where email like ${`%${TAG}%`}`;
});
afterAll(async () => {
  await sql.end();
});

async function hook(email: string | null) {
  const event = { user: email == null ? {} : { email } };
  const [row] = await sql`select public.before_user_created_hook(${sql.json(event)}) as r`;
  return row.r as { error?: { http_code: number } };
}
async function invite(email: string, extra: "live" | "expired" | "revoked" | "consumed" = "live") {
  await sql`
    insert into invites (email, token_hash, role, expires_at, revoked_at, consumed_at)
    values (
      ${email}, ${"x"}, 'owner',
      ${extra === "expired" ? sql`now() - interval '1 day'` : sql`now() + interval '1 day'`},
      ${extra === "revoked" ? sql`now()` : null},
      ${extra === "consumed" ? sql`now()` : null}
    )`;
}

describe("before_user_created_hook", () => {
  it("rejects an email without an invite with 403", async () => {
    expect((await hook(`none-${randomUUID()}@${TAG}.example`)).error?.http_code).toBe(403);
  });
  it("allows a live invite, case-insensitively", async () => {
    const email = `live-${randomUUID()}@${TAG}.example`;
    await invite(email);
    expect(await hook(email.toUpperCase())).toEqual({});
  });
  it.each(["expired", "revoked", "consumed"] as const)("rejects a %s invite", async (state) => {
    const email = `${state}-${randomUUID()}@${TAG}.example`;
    await invite(email, state);
    expect((await hook(email)).error?.http_code).toBe(403);
  });
  it("rejects an event without an email (e.g. phone sign-up)", async () => {
    expect((await hook(null)).error?.http_code).toBe(403);
  });
  it("is not callable by authenticated users over RPC", async () => {
    const [row] = await sql`select has_function_privilege('authenticated', 'public.before_user_created_hook(jsonb)', 'execute') as x`;
    expect(row.x).toBe(false);
  });
});

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. See project memory.
//
// Covers what rls-tenancy-isolation.test.ts doesn't: the `authenticated`
// role's write path on `invites` (owner_insert_invites/owner_update_invites,
// migration 0005) plus the table-level GRANTs migration 0006 added — RLS
// policies alone don't grant table access (see project memory on
// authenticated-role grants), and until this test existed nothing exercised
// INSERT/UPDATE on `invites` as anything other than the postgres superuser.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let ownerUserId: string;
let tenantUserId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

beforeAll(async () => {
  ownerUserId = randomUUID();
  tenantUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into auth.users (id) values (${tenantUserId})`;
  await adminSql`insert into profiles (id, role, locale) values (${ownerUserId}, 'owner', 'hu')`;
  await adminSql`insert into profiles (id, role, locale) values (${tenantUserId}, 'tenant', 'hu')`;
});

afterAll(async () => {
  await adminSql`delete from invites where email like '%rls-invite-write-test%'`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${tenantUserId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${tenantUserId})`;
  await adminSql.end();
});

describe("RLS + grants: invites owner write path", () => {
  it("an owner can create, see, and revoke an invite", async () => {
    const email = `owner-created-${randomUUID()}@rls-invite-write-test.example`;
    let inviteId: string;

    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into invites (email, token_hash, role, expires_at)
        values (${email}, 'x', 'tenant', now() + interval '7 days')
        returning id, revoked_at
      `;
      expect(row.revoked_at).toBeNull();
      inviteId = row.id;
    });

    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from invites where id = ${inviteId!}`;
      expect(rows).toHaveLength(1);
    });

    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        update invites set revoked_at = now() where id = ${inviteId!} returning revoked_at
      `;
      expect(row.revoked_at).not.toBeNull();
    });
  });

  it("a tenant cannot create an invite", async () => {
    const email = `tenant-attempt-${randomUUID()}@rls-invite-write-test.example`;
    await expect(
      asUser(tenantUserId, async (tx) => {
        await tx`
          insert into invites (email, token_hash, role, expires_at)
          values (${email}, 'x', 'tenant', now() + interval '7 days')
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant's select of invites returns nothing", async () => {
    const email = `owner-visibility-${randomUUID()}@rls-invite-write-test.example`;
    const [{ id: inviteId }] = await adminSql`
      insert into invites (email, token_hash, role, expires_at)
      values (${email}, 'x', 'tenant', now() + interval '7 days')
      returning id
    `;

    await asUser(tenantUserId, async (tx) => {
      const rows = await tx`select id from invites where id = ${inviteId}`;
      expect(rows).toHaveLength(0);
    });
  });
});

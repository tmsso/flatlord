import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Same asUser/adminSql pattern as rls-requests-isolation.test.ts, extended
// to the Phase 3 item 3 field_policies write access + persons self-update
// policies (migration 0021). No properties/tenancies needed here — the
// policies under test (field_policies read/write, persons self-update)
// don't depend on tenancy scoping.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let personAId: string;
let userAId: string;
let personBId: string;
let userBId: string;
let ownerPersonId: string;
let ownerUserId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

// RLS denial can surface either as a silent 0-row UPDATE/INSERT-rejected
// or a thrown "row-level security" error — both are valid denial shapes,
// see project memory flatlord_authenticated_role_grants.
async function expectUpdateDenied(userId: string, query: (tx: postgres.TransactionSql) => Promise<{ count: number }>) {
  try {
    await asUser(userId, async (tx) => {
      const result = await query(tx);
      expect(result.count).toBe(0);
    });
  } catch (err) {
    expect(String(err)).toMatch(/row-level security|permission denied/i);
  }
}

beforeAll(async () => {
  const [personA] = await adminSql`insert into persons (given_name, family_name, phone) values ('RRI Test', 'Tenant A', '+36000000') returning id`;
  personAId = personA.id;
  userAId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;

  const [personB] = await adminSql`insert into persons (given_name, family_name) values ('RRI Test', 'Tenant B') returning id`;
  personBId = personB.id;
  userBId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userBId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userBId}, ${personBId}, 'tenant', 'hu')`;

  const [ownerPerson] = await adminSql`insert into persons (given_name, family_name) values ('RRI Test', 'Owner') returning id`;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
});

afterAll(async () => {
  await adminSql`delete from field_policies where entity_type = 'person' and field_name = 'phone' and scope = 'RRI-test-scope'`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${userAId}, ${userBId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${personAId}, ${personBId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${userAId}, ${userBId})`;
  await adminSql.end();
});

describe("RLS: field editability isolation (migration 0021)", () => {
  it("any authenticated user (tenant included) can read field_policies", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select field_name, policy from field_policies where entity_type = 'person' and field_name = 'phone'`;
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("a tenant cannot insert, update, or delete field_policies", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`insert into field_policies (entity_type, field_name, policy, scope) values ('person', 'phone', 'free', 'RRI-test-scope')`;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);

    await expectUpdateDenied(userAId, (tx) => tx`update field_policies set policy = 'read_only' where entity_type = 'person' and field_name = 'phone' and scope is null`);
    const [after] = await adminSql`select policy from field_policies where entity_type = 'person' and field_name = 'phone' and scope is null`;
    expect(after.policy).toBe("free");
  });

  it("an owner can insert, update, and delete field_policies", async () => {
    let insertedId: string;
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into field_policies (entity_type, field_name, policy, scope) values ('person', 'phone', 'read_only', 'RRI-test-scope')
        returning id
      `;
      expect(row.id).toBeTruthy();
      insertedId = row.id;
      await tx`update field_policies set policy = 'approval_required' where id = ${row.id}`;
    });
    const [afterUpdate] = await adminSql`select policy from field_policies where entity_type = 'person' and field_name = 'phone' and scope = 'RRI-test-scope'`;
    expect(afterUpdate.policy).toBe("approval_required");

    await asUser(ownerUserId, async (tx) => {
      await tx`delete from field_policies where entity_type = 'person' and field_name = 'phone' and scope = 'RRI-test-scope'`;
    });
    const remaining = await adminSql`select id from field_policies where entity_type = 'person' and field_name = 'phone' and scope = 'RRI-test-scope'`;
    expect(remaining).toHaveLength(0);
  });

  it("a tenant can update their own person row (the `free` self-edit path)", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`update persons set phone = '+36111111' where id = ${personAId}`;
      expect(result.count).toBe(1);
    });
    const [after] = await adminSql`select phone from persons where id = ${personAId}`;
    expect(after.phone).toBe("+36111111");
  });

  it("a tenant cannot update another person's row", async () => {
    await expectUpdateDenied(userAId, (tx) => tx`update persons set phone = '+36999999' where id = ${personBId}`);
    const [after] = await adminSql`select phone from persons where id = ${personBId}`;
    expect(after.phone).toBeNull();
  });

  it("the owner can still update any person row (owner_update_persons, unaffected by the new self policy)", async () => {
    await asUser(ownerUserId, async (tx) => {
      const result = await tx`update persons set phone = '+36222222' where id = ${personBId}`;
      expect(result.count).toBe(1);
    });
    const [after] = await adminSql`select phone from persons where id = ${personBId}`;
    expect(after.phone).toBe("+36222222");
  });
});

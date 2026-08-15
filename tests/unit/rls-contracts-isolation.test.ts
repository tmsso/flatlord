import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. Mirrors the asUser/adminSql
// pattern in rls-billing-isolation.test.ts, extended to the Phase 2
// contracts table + policies (migration 0015).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let flatAId: string;
let personAId: string;
let userAId: string;
let tenancyAId: string;
let draftContractAId: string;
let activeContractAId: string;
let superseededContractAId: string;
// Owns houseId — exercises owner_scope_contracts / owner_insert_contracts.
let ownerUserId: string;
let ownerPersonId: string;
// Owns nothing — negative control for owner scoping.
let strangerOwnerUserId: string;
let strangerOwnerPersonId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

beforeAll(async () => {
  houseId = randomUUID();
  await adminSql`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${houseId}, ${houseId}, null, 'house', 'RCI Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RCI Test Flat A', 'whole', true)
    returning id
  `;
  flatAId = flatA.id;

  const [personA] = await adminSql`
    insert into persons (given_name, family_name) values ('RCI Test', 'Tenant A') returning id
  `;
  personAId = personA.id;
  userAId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;

  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatAId}, ${personAId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyAId = tenancyA.id;

  const [superseededContract] = await adminSql`
    insert into contracts (tenancy_id, version, status, term_start, notice_days)
    values (${tenancyAId}, 1, 'superseded', '2025-01-01', 30)
    returning id
  `;
  superseededContractAId = superseededContract.id;

  const [activeContract] = await adminSql`
    insert into contracts (tenancy_id, version, status, predecessor_contract_id, term_start, notice_days)
    values (${tenancyAId}, 2, 'active', ${superseededContractAId}, '2026-01-01', 30)
    returning id
  `;
  activeContractAId = activeContract.id;

  const [draftContract] = await adminSql`
    insert into contracts (tenancy_id, version, status, predecessor_contract_id, term_start, notice_days)
    values (${tenancyAId}, 3, 'draft', ${activeContractAId}, '2027-01-01', 30)
    returning id
  `;
  draftContractAId = draftContract.id;

  const [ownerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RCI Test', 'Owner') returning id
  `;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;

  const [strangerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RCI Test', 'Stranger Owner') returning id
  `;
  strangerOwnerPersonId = strangerPerson.id;
  strangerOwnerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${strangerOwnerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${strangerOwnerUserId}, ${strangerOwnerPersonId}, 'owner', 'hu')`;
});

afterAll(async () => {
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from contracts where tenancy_id = ${tenancyAId}`;
  await adminSql`delete from tenancies where id = ${tenancyAId}`;
  await adminSql`delete from profiles where id = ${userAId}`;
  await adminSql`delete from persons where id = ${personAId}`;
  await adminSql`delete from properties where name like 'RCI Test%'`;
  await adminSql`delete from auth.users where id = ${userAId}`;
  await adminSql.end();
});

describe("RLS: contracts isolation (migration 0015)", () => {
  it("a tenant sees active/superseded contracts on their own tenancy, not the draft", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id, status from contracts where tenancy_id = ${tenancyAId} order by version`;
      expect(rows.map((r) => r.status)).toEqual(["superseded", "active"]);
      expect(rows.map((r) => r.id)).not.toContain(draftContractAId);
      const draftDirect = await tx`select id from contracts where id = ${draftContractAId}`;
      expect(draftDirect).toHaveLength(0);
    });
  });

  it("a tenant cannot insert a contract", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into contracts (tenancy_id, version, status, term_start, notice_days)
          values (${tenancyAId}, 4, 'draft', '2028-01-01', 30)
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  // No tenant UPDATE policy exists at all (tenant_scope_contracts is
  // SELECT-only) — Postgres doesn't error on an UPDATE that matches zero
  // rows under RLS, it just silently affects 0 rows, so the assertion has
  // to be "the value didn't change", not "the statement threw".
  it("a tenant's update to a contract silently affects no rows", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`update contracts set notice_days = 45 where id = ${activeContractAId}`;
      expect(result.count).toBe(0);
    });
    const [after] = await adminSql`select notice_days from contracts where id = ${activeContractAId}`;
    expect(after.notice_days).toBe(30);
  });

  it("the owning owner sees all versions including the draft; a stranger owner sees none", async () => {
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from contracts where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(3);
    });
    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from contracts where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("the owning owner can insert and update a contract on their own property", async () => {
    let insertedId: string | undefined;
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into contracts (tenancy_id, version, status, term_start, notice_days)
        values (${tenancyAId}, 4, 'draft', '2028-01-01', 30)
        returning id
      `;
      insertedId = row.id;
      await tx`update contracts set notice_days = 45 where id = ${row.id}`;
    });
    expect(insertedId).toBeTruthy();
    const [after] = await adminSql`select notice_days from contracts where id = ${insertedId!}`;
    expect(after.notice_days).toBe(45);
    await adminSql`delete from contracts where id = ${insertedId!}`;
  });

  it("a stranger owner cannot insert a contract on a tenancy they don't own", async () => {
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`
          insert into contracts (tenancy_id, version, status, term_start, notice_days)
          values (${tenancyAId}, 5, 'draft', '2028-01-01', 30)
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("only one active contract per tenancy is allowed (contracts_one_active_per_tenancy)", async () => {
    await expect(
      adminSql`
        insert into contracts (tenancy_id, version, status, term_start, notice_days)
        values (${tenancyAId}, 6, 'active', '2029-01-01', 30)
      `,
    ).rejects.toThrow(/duplicate key|unique constraint/i);
  });

  it("property_id is trigger-set from the tenancy's root property, never trusted from app input", async () => {
    // tenancies.property_id denormalizes root_property_id (trg_tenancies_
    // validate_unit, migration 0001), not the flat itself — contracts'
    // own denorm trigger just copies that value, so the expected id here
    // is the house, not the flat.
    const [row] = await adminSql`select property_id from contracts where id = ${activeContractAId}`;
    expect(row.property_id).toBe(houseId);
  });
});

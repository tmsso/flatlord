import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// B-13 (migration 0039): handover snapshots are owner-written, immutable,
// readable by the property's owner and the tenancy's tenant (D-49) only.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });
const P = "RHS Test";

let houseId: string, flatAId: string, flatBId: string;
let tenantUserId: string, tenantPersonId: string, tenantBPersonId: string;
let ownerUserId: string, ownerPersonId: string, strangerUserId: string, strangerPersonId: string;
let tenancyAId: string, tenancyBId: string, snapshotAId: string, snapshotBId: string;

async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    return fn(tx);
  })) as T;
}
async function user(role: "owner" | "tenant", family: string) {
  const [p] = await adminSql`insert into persons (given_name, family_name) values (${P}, ${family}) returning id`;
  const id = randomUUID();
  await adminSql`insert into auth.users (id) values (${id})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${id}, ${p.id}, ${role}, 'hu')`;
  return { userId: id, personId: p.id as string };
}

beforeAll(async () => {
  houseId = randomUUID();
  await adminSql`insert into properties (id, root_property_id, type, name, active) values (${houseId}, ${houseId}, 'house', ${`${P} House`}, true)`;
  [{ id: flatAId }] = await adminSql`insert into properties (root_property_id, parent_id, type, name, letting_mode, active) values (${houseId}, ${houseId}, 'flat', ${`${P} Flat A`}, 'whole', true) returning id`;
  [{ id: flatBId }] = await adminSql`insert into properties (root_property_id, parent_id, type, name, letting_mode, active) values (${houseId}, ${houseId}, 'flat', ${`${P} Flat B`}, 'whole', true) returning id`;
  ({ userId: tenantUserId, personId: tenantPersonId } = await user("tenant", "Tenant A"));
  ({ userId: ownerUserId, personId: ownerPersonId } = await user("owner", "Owner"));
  ({ userId: strangerUserId, personId: strangerPersonId } = await user("owner", "Stranger"));
  [{ id: tenantBPersonId }] = await adminSql`insert into persons (given_name, family_name) values (${P}, 'Tenant B') returning id`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;
  [{ id: tenancyAId }] = await adminSql`insert into tenancies (unit_id, primary_tenant_id, term_start, status) values (${flatAId}, ${tenantPersonId}, '2026-01-01', 'active') returning id`;
  [{ id: tenancyBId }] = await adminSql`insert into tenancies (unit_id, primary_tenant_id, term_start, status) values (${flatBId}, ${tenantBPersonId}, '2026-01-01', 'active') returning id`;
  [{ id: snapshotAId }] = await adminSql`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyAId}, 'move_in', ${ownerPersonId}) returning id`;
  [{ id: snapshotBId }] = await adminSql`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyBId}, 'move_in', ${ownerPersonId}) returning id`;
});

afterAll(async () => {
  await adminSql`delete from handover_snapshots where tenancy_id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from tenancies where id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerUserId}, ${tenantUserId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerUserId}, ${tenantUserId})`;
  await adminSql`delete from persons where given_name = ${P}`;
  await adminSql`delete from properties where name like ${`${P}%`}`;
  await adminSql.end();
});

describe("RLS: handover_snapshots (0039)", () => {
  it("property_id is denormalized from the tenancy", async () => {
    const [row] = await adminSql`select s.property_id = t.property_id as ok from handover_snapshots s join tenancies t on t.id = s.tenancy_id where s.id = ${snapshotAId}`;
    expect(row.ok).toBe(true);
  });
  it("the tenant reads their own tenancy's snapshot, not a foreign one", async () => {
    const ids = await asUser(tenantUserId, (tx) => tx`select id from handover_snapshots where id in (${snapshotAId}, ${snapshotBId})`);
    expect(ids.map((r) => r.id)).toEqual([snapshotAId]);
  });
  it("the owner reads both; a stranger owner reads none", async () => {
    expect(await asUser(ownerUserId, (tx) => tx`select id from handover_snapshots where id in (${snapshotAId}, ${snapshotBId})`)).toHaveLength(2);
    expect(await asUser(strangerUserId, (tx) => tx`select id from handover_snapshots where id in (${snapshotAId}, ${snapshotBId})`)).toHaveLength(0);
  });
  it("the owner inserts as themselves on an owned tenancy", async () => {
    const rows = await asUser(ownerUserId, (tx) => tx`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyAId}, 'move_out', ${ownerPersonId}) returning id`);
    expect(rows).toHaveLength(1);
  });
  it("forged actor, stranger owner and tenant inserts are refused", async () => {
    await expect(asUser(ownerUserId, (tx) => tx`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyAId}, 'move_out', ${strangerPersonId})`)).rejects.toThrow(/row-level security/);
    await expect(asUser(strangerUserId, (tx) => tx`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyAId}, 'move_out', ${strangerPersonId})`)).rejects.toThrow(/row-level security/);
    await expect(asUser(tenantUserId, (tx) => tx`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyAId}, 'move_out', ${tenantPersonId})`)).rejects.toThrow(/row-level security/);
  });
  it("a snapshot is immutable: owner update and delete never change a row", async () => {
    // Without UPDATE/DELETE grants a clean database refuses outright
    // (permission denied); dev's permissive default ACL lets the statement
    // run, and the missing RLS policy then matches no row. Either is fine.
    for (const stmt of [
      (tx: postgres.TransactionSql) => tx`update handover_snapshots set note = 'changed' where id = ${snapshotAId}`,
      (tx: postgres.TransactionSql) => tx`delete from handover_snapshots where id = ${snapshotAId}`,
    ]) {
      const outcome = await asUser(ownerUserId, async (tx) => (await stmt(tx)).count).catch((e: Error) => e.message);
      expect(outcome === 0 || /permission denied/.test(String(outcome))).toBe(true);
    }
    const [row] = await adminSql`select note from handover_snapshots where id = ${snapshotAId}`;
    expect(row.note).toBeNull();
  });
  it("kind is limited to move_in / move_out", async () => {
    await expect(adminSql`insert into handover_snapshots (tenancy_id, kind, taken_by) values (${tenancyAId}, 'other', ${ownerPersonId})`).rejects.toThrow(/handover_snapshots_kind_check/);
  });
});

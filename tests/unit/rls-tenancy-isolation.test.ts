import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. See project memory.
//
// The connection used here is the postgres superuser (via SUPABASE_DB_URL),
// which bypasses RLS by default — so fixture setup uses it directly, and
// the actual isolation assertions run through a second connection with
// `set local role authenticated` + a forged `request.jwt.claims`, which is
// how Supabase's own RLS policies read auth.uid(). Test-only auth.users
// rows are inserted directly (minimal columns) purely as FK targets for
// profiles — they are not real, loggable-in accounts.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let tenantAUserId: string;
let tenantBUserId: string;
let tenantAPersonId: string;
let tenantBPersonId: string;
let tenantATenancyId: string;
let tenantBTenancyId: string;

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
    values (${houseId}, ${houseId}, null, 'house', 'RLS Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RLS Test Flat A', 'whole', true)
    returning id
  `;
  const [flatB] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RLS Test Flat B', 'whole', true)
    returning id
  `;

  const [personA] = await adminSql`
    insert into persons (given_name, family_name) values ('RLS Test', 'Tenant A') returning id
  `;
  const [personB] = await adminSql`
    insert into persons (given_name, family_name) values ('RLS Test', 'Tenant B') returning id
  `;
  tenantAPersonId = personA.id;
  tenantBPersonId = personB.id;

  tenantAUserId = randomUUID();
  tenantBUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${tenantAUserId})`;
  await adminSql`insert into auth.users (id) values (${tenantBUserId})`;

  await adminSql`
    insert into profiles (id, person_id, role, locale) values (${tenantAUserId}, ${tenantAPersonId}, 'tenant', 'hu')
  `;
  await adminSql`
    insert into profiles (id, person_id, role, locale) values (${tenantBUserId}, ${tenantBPersonId}, 'tenant', 'hu')
  `;

  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatA.id}, ${tenantAPersonId}, '2026-01-01', 'active')
    returning id
  `;
  const [tenancyB] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatB.id}, ${tenantBPersonId}, '2026-01-01', 'active')
    returning id
  `;
  tenantATenancyId = tenancyA.id;
  tenantBTenancyId = tenancyB.id;
});

afterAll(async () => {
  await adminSql`delete from tenancies where id in (${tenantATenancyId}, ${tenantBTenancyId})`;
  await adminSql`delete from profiles where id in (${tenantAUserId}, ${tenantBUserId})`;
  await adminSql`delete from persons where id in (${tenantAPersonId}, ${tenantBPersonId})`;
  await adminSql`delete from properties where name like 'RLS Test%'`;
  await adminSql`delete from auth.users where id in (${tenantAUserId}, ${tenantBUserId})`;
  await adminSql.end();
});

describe("RLS: tenancy isolation", () => {
  it("a tenant sees their own tenancy", async () => {
    await asUser(tenantAUserId, async (tx) => {
      const rows = await tx`select id from tenancies where id = ${tenantATenancyId}`;
      expect(rows).toHaveLength(1);
    });
  });

  it("a tenant cannot see another tenant's tenancy", async () => {
    await asUser(tenantAUserId, async (tx) => {
      const rows = await tx`select id from tenancies where id = ${tenantBTenancyId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("a tenant's unscoped select only returns their own row(s)", async () => {
    await asUser(tenantBUserId, async (tx) => {
      const rows = await tx`select id from tenancies`;
      expect(rows.map((r) => r.id)).toEqual([tenantBTenancyId]);
    });
  });
});

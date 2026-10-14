import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// B-45 / D-33 module switches (migration 0033): per-owner
// profiles.enabled_modules, and property_enabled_modules() — the union over
// a property's owners, answered only to that property's owners and tenants.
// Same asUser/adminSql pattern as the other rls-*.test.ts files (CI-only).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

const userIds: string[] = [];
const personIds: string[] = [];
let houseId: string;
let tenancyId: string;
let ownerAUserId: string;
let ownerBUserId: string;
let strangerUserId: string;
let tenantUserId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

async function user(role: "owner" | "tenant", name: string, modules: string[]) {
  const [person] = await adminSql`insert into persons (given_name, family_name) values ('RMS Test', ${name}) returning id`;
  personIds.push(person.id);
  const userId = randomUUID();
  userIds.push(userId);
  await adminSql`insert into auth.users (id) values (${userId})`;
  await adminSql`
    insert into profiles (id, person_id, role, locale, enabled_modules)
    values (${userId}, ${person.id}, ${role}, 'hu', ${modules}::text[])
  `;
  return { userId, personId: person.id as string };
}

async function propertyModules(userId: string): Promise<string[]> {
  let result: string[] = [];
  await asUser(userId, async (tx) => {
    const [row] = await tx`select property_enabled_modules(${houseId}) as modules`;
    result = row.modules;
  });
  return result;
}

beforeAll(async () => {
  const a = await user("owner", "Owner A", ["inventory"]);
  const b = await user("owner", "Owner B", ["requests"]);
  const stranger = await user("owner", "Stranger", ["inventory", "requests", "notifications"]);
  const tenant = await user("tenant", "Tenant", []);
  ownerAUserId = a.userId;
  ownerBUserId = b.userId;
  strangerUserId = stranger.userId;
  tenantUserId = tenant.userId;

  houseId = randomUUID();
  await adminSql`insert into properties (id, root_property_id, parent_id, type, name, active) values (${houseId}, ${houseId}, null, 'house', 'RMS Test House', true)`;
  const [flat] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RMS Test Flat', 'whole', true) returning id
  `;
  // Co-owned: A and B.
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${a.personId}, 50), (${houseId}, ${b.personId}, 50)`;
  const [tenancy] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status) values (${flat.id}, ${tenant.personId}, '2026-01-01', 'active') returning id
  `;
  tenancyId = tenancy.id;
});

afterAll(async () => {
  await adminSql`delete from tenancies where id = ${tenancyId}`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from properties where root_property_id = ${houseId} and parent_id is not null`;
  await adminSql`delete from properties where id = ${houseId}`;
  await adminSql`delete from profiles where id = any(${userIds}::uuid[])`;
  await adminSql`delete from auth.users where id = any(${userIds}::uuid[])`;
  await adminSql`delete from persons where id = any(${personIds}::uuid[])`;
  await adminSql.end();
});

describe("RLS: module switches (migration 0033)", () => {
  it("a new profile starts with every optional module off", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    await adminSql`insert into auth.users (id) values (${userId})`;
    await adminSql`insert into profiles (id, role, locale) values (${userId}, 'owner', 'hu')`;
    const [row] = await adminSql`select enabled_modules from profiles where id = ${userId}`;
    expect(row.enabled_modules).toEqual([]);
  });

  it("an owner switches their own modules, not another owner's", async () => {
    await asUser(ownerAUserId, async (tx) => {
      const own = await tx`update profiles set enabled_modules = '{inventory,notifications}' where id = ${ownerAUserId}`;
      expect(own.count).toBe(1);
      const other = await tx`update profiles set enabled_modules = '{}' where id = ${ownerBUserId}`;
      expect(other.count).toBe(0);
    });
    const [b] = await adminSql`select enabled_modules from profiles where id = ${ownerBUserId}`;
    expect(b.enabled_modules).toEqual(["requests"]);
    await adminSql`update profiles set enabled_modules = '{inventory}' where id = ${ownerAUserId}`;
  });

  it("unknown module names are rejected", async () => {
    await expect(
      asUser(ownerAUserId, async (tx) => {
        await tx`update profiles set enabled_modules = '{inventory,crypto}' where id = ${ownerAUserId}`;
      }),
    ).rejects.toThrow(/profiles_enabled_modules_known/);
  });

  it("property modules = union over the property's owners, for its owners and its tenant", async () => {
    expect(await propertyModules(ownerAUserId)).toEqual(["inventory", "requests"]);
    expect(await propertyModules(ownerBUserId)).toEqual(["inventory", "requests"]);
    expect(await propertyModules(tenantUserId)).toEqual(["inventory", "requests"]);
  });

  it("anyone else gets an empty set (no probing other properties)", async () => {
    expect(await propertyModules(strangerUserId)).toEqual([]);
  });
});

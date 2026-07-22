import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL), same
// asUser/adminSql pattern as rls-billing-isolation.test.ts. INSERT/SELECT
// against storage.objects go through raw SQL under `asUser` — RLS applies
// the same way regardless of how a row is written, and this avoids
// needing an actual file upload in a unit test. DELETE cannot: Supabase
// blocks direct SQL DELETE on storage.objects ("Direct deletion from
// storage tables is not allowed. Use the Storage API instead."), so all
// cleanup goes through the Storage API via a service-role client instead.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });
const storageAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
).storage.from("meter-photos");

let houseId: string;
let flatAId: string;
let flatBId: string;
let personAId: string;
let personBId: string;
let userAId: string;
let userBId: string;
let tenancyAId: string;
let tenancyBId: string;
let ownerUserId: string;
let ownerPersonId: string;
let strangerOwnerUserId: string;
let strangerOwnerPersonId: string;
let objectAId: string;
let objectAName: string;
let objectBId: string;
let objectBName: string;

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
    values (${houseId}, ${houseId}, null, 'house', 'RBI Storage Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RBI Storage Test Flat A', 'whole', true)
    returning id
  `;
  const [flatB] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RBI Storage Test Flat B', 'whole', true)
    returning id
  `;
  flatAId = flatA.id;
  flatBId = flatB.id;

  const [personA] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Storage', 'Tenant A') returning id
  `;
  const [personB] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Storage', 'Tenant B') returning id
  `;
  personAId = personA.id;
  personBId = personB.id;

  userAId = randomUUID();
  userBId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into auth.users (id) values (${userBId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userBId}, ${personBId}, 'tenant', 'hu')`;

  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatAId}, ${personAId}, '2026-01-01', 'active')
    returning id
  `;
  const [tenancyB] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatBId}, ${personBId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyAId = tenancyA.id;
  tenancyBId = tenancyB.id;

  const [ownerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Storage', 'Owner') returning id
  `;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;

  const [strangerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Storage', 'Stranger Owner') returning id
  `;
  strangerOwnerPersonId = strangerPerson.id;
  strangerOwnerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${strangerOwnerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${strangerOwnerUserId}, ${strangerOwnerPersonId}, 'owner', 'hu')`;

  objectAName = tenancyAId + "/dummy-meter/" + randomUUID() + ".jpg";
  const [objectA] = await adminSql`
    insert into storage.objects (bucket_id, name)
    values ('meter-photos', ${objectAName})
    returning id
  `;
  objectAId = objectA.id;
  objectBName = tenancyBId + "/dummy-meter/" + randomUUID() + ".jpg";
  const [objectB] = await adminSql`
    insert into storage.objects (bucket_id, name)
    values ('meter-photos', ${objectBName})
    returning id
  `;
  objectBId = objectB.id;
});

afterAll(async () => {
  await storageAdmin.remove([objectAName, objectBName]);
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from tenancies where id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from profiles where id in (${userAId}, ${userBId})`;
  await adminSql`delete from persons where id in (${personAId}, ${personBId})`;
  await adminSql`delete from properties where name like 'RBI Storage Test%'`;
  await adminSql`delete from auth.users where id in (${userAId}, ${userBId})`;
  await adminSql.end();
});

describe("RLS: meter-photos Storage bucket", () => {
  it("a tenant can insert an object under their own tenancy folder", async () => {
    const name = tenancyAId + "/dummy-meter/" + randomUUID() + ".jpg";
    let insertedId: string | undefined;
    await asUser(userAId, async (tx) => {
      const [row] = await tx`
        insert into storage.objects (bucket_id, name)
        values ('meter-photos', ${name})
        returning id
      `;
      insertedId = row.id;
    });
    expect(insertedId).toBeTruthy();
    await storageAdmin.remove([name]);
  });

  it("a tenant cannot insert an object under another tenant's tenancy folder", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into storage.objects (bucket_id, name)
          values ('meter-photos', ${tenancyBId + "/dummy-meter/" + randomUUID() + ".jpg"})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant can select their own tenancy's objects, not another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from storage.objects where id = ${objectAId}`;
      expect(own).toHaveLength(1);
      const other = await tx`select id from storage.objects where id = ${objectBId}`;
      expect(other).toHaveLength(0);
    });
  });

  it("an owner can select any tenancy's objects on a property they own", async () => {
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from storage.objects where id in (${objectAId}, ${objectBId})`;
      expect(rows.map((r) => r.id).sort()).toEqual([objectAId, objectBId].sort());
    });
  });

  it("an owner who owns nothing cannot select these objects", async () => {
    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from storage.objects where id in (${objectAId}, ${objectBId})`;
      expect(rows).toHaveLength(0);
    });
  });
});

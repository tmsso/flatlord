import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// B-47 (migration 0035): the first ownership row of an unowned property
// may only be added by the session that created it, and only on a root
// property. Before 0035 any owner could claim any property that had no
// ownership row yet — dev's orphan demo houses, a half-created property,
// or a room (rooms never carry ownership rows).
//
// Same asUser/adminSql pattern as the other rls-*.test.ts files; runs in CI
// against `supabase db start` (DB-backed tests are CI-only).
const dbUrl = process.env.SUPABASE_DB_URL ?? "";
// Writes fixture rows — never against the production project.
if (dbUrl.includes("zarpjgtcwkndtmlnhmdd")) throw new Error("refusing to run a data-creating test against prod");
const adminSql = postgres(dbUrl, { prepare: false });

const TAG = "ROB Test";

let ownerAUserId: string;
let ownerAPersonId: string;
let ownerBUserId: string;
let ownerBPersonId: string;
const propertyIds: string[] = [];
const personIds: string[] = [];
const userIds: string[] = [];

async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let result: T;
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    result = await fn(tx);
  });
  return result!;
}

async function expectRlsRejection(userId: string, fn: (tx: postgres.TransactionSql) => Promise<unknown>) {
  await expect(asUser(userId, fn)).rejects.toThrow(/row-level security|permission denied/i);
}

async function newOwner(familyName: string) {
  const [person] = await adminSql`
    insert into persons (given_name, family_name) values (${TAG}, ${familyName}) returning id
  `;
  personIds.push(person.id);
  const userId = randomUUID();
  userIds.push(userId);
  await adminSql`insert into auth.users (id) values (${userId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userId}, ${person.id}, 'owner', 'hu')`;
  return { userId, personId: person.id as string };
}

// A root house inserted through RLS as `userId` — no ownership row yet,
// i.e. the state between create-property.ts's two inserts.
async function createUnownedHouseAs(userId: string, name: string) {
  const id = randomUUID();
  propertyIds.push(id);
  await asUser(userId, async (tx) => {
    // No RETURNING: the creator can't SELECT a property they don't own yet.
    await tx`
      insert into properties (id, root_property_id, parent_id, type, name, address_line, active)
      values (${id}, ${id}, null, 'house', ${`${TAG} ${name}`}, 'Test street 1', true)
    `;
  });
  return id;
}

function claim(propertyId: string, personId: string) {
  return (tx: postgres.TransactionSql) => tx`
    insert into property_ownership (property_id, person_id, percentage) values (${propertyId}, ${personId}, 100)
  `;
}

beforeAll(async () => {
  ({ userId: ownerAUserId, personId: ownerAPersonId } = await newOwner("Owner A"));
  ({ userId: ownerBUserId, personId: ownerBPersonId } = await newOwner("Owner B"));
});

afterAll(async () => {
  await adminSql`delete from audit_log where entity_id = any(${propertyIds}::uuid[]) or actor_id = any(${personIds}::uuid[])`;
  await adminSql`delete from field_policies where property_id = any(${propertyIds}::uuid[])`;
  await adminSql`delete from property_ownership where property_id = any(${propertyIds}::uuid[])`;
  await adminSql`delete from properties where id = any(${propertyIds}::uuid[]) and parent_id is not null`;
  await adminSql`delete from properties where id = any(${propertyIds}::uuid[])`;
  await adminSql`delete from profiles where id = any(${userIds}::uuid[])`;
  await adminSql`delete from auth.users where id = any(${userIds}::uuid[])`;
  await adminSql`delete from persons where id = any(${personIds}::uuid[])`;
  await adminSql.end();
});

describe("ownership bootstrap (B-47, 0035)", () => {
  it("records the creating session in created_by, ignoring a client-supplied value", async () => {
    const id = randomUUID();
    propertyIds.push(id);
    await asUser(ownerAUserId, async (tx) => {
      await tx`
        insert into properties (id, root_property_id, parent_id, type, name, address_line, active, created_by)
        values (${id}, ${id}, null, 'house', ${`${TAG} spoofed`}, 'Test street 2', true, ${ownerBUserId})
      `;
    });
    const [row] = await adminSql`select created_by from properties where id = ${id}`;
    expect(row.created_by).toBe(ownerAUserId);
    // …so B still can't claim it.
    await expectRlsRejection(ownerBUserId, claim(id, ownerBPersonId));
  });

  it("owner B cannot claim an unowned root property created by owner A", async () => {
    const id = await createUnownedHouseAs(ownerAUserId, "A orphan");
    await expectRlsRejection(ownerBUserId, claim(id, ownerBPersonId));
  });

  it("owner A can still add the first ownership row of their own new property", async () => {
    const id = await createUnownedHouseAs(ownerAUserId, "A own");
    await asUser(ownerAUserId, claim(id, ownerAPersonId));
    const [row] = await adminSql`select count(*)::int as n from property_ownership where property_id = ${id}`;
    expect(row.n).toBe(1);
  });

  it("nobody can claim a property created by the service role (created_by NULL)", async () => {
    const id = randomUUID();
    propertyIds.push(id);
    await adminSql`
      insert into properties (id, root_property_id, parent_id, type, name, address_line, active)
      values (${id}, ${id}, null, 'house', ${`${TAG} seeded`}, 'Test street 3', true)
    `;
    const [row] = await adminSql`select created_by from properties where id = ${id}`;
    expect(row.created_by).toBeNull();
    await expectRlsRejection(ownerBUserId, claim(id, ownerBPersonId));
  });

  it("owner B cannot claim a room inside owner A's house", async () => {
    const houseId = await createUnownedHouseAs(ownerAUserId, "A with room");
    await asUser(ownerAUserId, claim(houseId, ownerAPersonId));
    const roomId = randomUUID();
    propertyIds.push(roomId);
    await adminSql`
      insert into properties (id, root_property_id, parent_id, type, name, letting_mode, active)
      values (${roomId}, ${houseId}, ${houseId}, 'flat', ${`${TAG} A flat`}, 'whole', true)
    `;
    await expectRlsRejection(ownerBUserId, claim(roomId, ownerBPersonId));
  });

  it("created_by cannot be rewritten afterwards", async () => {
    const id = await createUnownedHouseAs(ownerAUserId, "A rewrite");
    await asUser(ownerAUserId, claim(id, ownerAPersonId));
    await asUser(ownerAUserId, async (tx) => {
      await tx`update properties set created_by = ${ownerBUserId} where id = ${id}`;
    });
    const [row] = await adminSql`select created_by from properties where id = ${id}`;
    expect(row.created_by).toBe(ownerAUserId);
  });
});

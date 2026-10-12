import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Owner-to-owner isolation (migration 0032, long batch 2026-10-12). Two
// owners, A and B, each with their own house. Before 0032 every owner saw
// and could edit every person (incl. ID-document data), every person
// attachment / ID scan, every invite and the whole audit log, and could
// repoint their own property_ownership row at someone else's house. Each
// test below states one of those holes as "B cannot …", plus the matching
// "A still can …" so a too-strict policy fails too.
//
// Same asUser/adminSql pattern as the other rls-*.test.ts files; runs in CI
// against `supabase db start` (DB-backed tests are CI-only, see memory).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

const TAG = "ROI Test";

let ownerAUserId: string;
let ownerAPersonId: string;
let houseAId: string;
let flatAId: string;
let tenantAPersonId: string;
let tenantAUserId: string;
let tenancyAId: string;
let unlinkedAPersonId: string;
let personAttachmentId: string;
let personObjectName: string;
let inviteAId: string;
let auditTenancyAId: string;
let auditPersonAId: string;
let policyAId: string;

let ownerBUserId: string;
let ownerBPersonId: string;
let houseBId: string;
let flatBId: string;
let tenantBPersonId: string;
let tenancyBId: string;

const createdPersonIds: string[] = [];

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

async function expectRlsRejection(userId: string, fn: (tx: postgres.TransactionSql) => Promise<unknown>) {
  await expect(asUser(userId, async (tx) => void (await fn(tx)))).rejects.toThrow(/row-level security|permission denied/i);
}

async function newPerson(familyName: string, managedBy: string | null = null) {
  const [row] = await adminSql`
    insert into persons (given_name, family_name, managed_by_person_id)
    values (${TAG}, ${familyName}, ${managedBy})
    returning id
  `;
  createdPersonIds.push(row.id);
  return row.id as string;
}

async function newOwner(familyName: string) {
  const personId = await newPerson(familyName);
  const userId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userId}, ${personId}, 'owner', 'hu')`;
  const houseId = randomUUID();
  await adminSql`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${houseId}, ${houseId}, null, 'house', ${`${TAG} House ${familyName}`}, true)
  `;
  const [flat] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', ${`${TAG} Flat ${familyName}`}, 'whole', true)
    returning id
  `;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${personId}, 100)`;
  return { personId, userId, houseId, flatId: flat.id as string };
}

beforeAll(async () => {
  ({ personId: ownerAPersonId, userId: ownerAUserId, houseId: houseAId, flatId: flatAId } = await newOwner("Owner A"));
  ({ personId: ownerBPersonId, userId: ownerBUserId, houseId: houseBId, flatId: flatBId } = await newOwner("Owner B"));

  tenantAPersonId = await newPerson("Tenant A", ownerAPersonId);
  tenantAUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${tenantAUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${tenantAUserId}, ${tenantAPersonId}, 'tenant', 'hu')`;
  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatAId}, ${tenantAPersonId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyAId = tenancyA.id;

  unlinkedAPersonId = await newPerson("Unlinked A", ownerAPersonId);

  tenantBPersonId = await newPerson("Tenant B", ownerBPersonId);
  const [tenancyB] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatBId}, ${tenantBPersonId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyBId = tenancyB.id;

  const [attachment] = await adminSql`
    insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
    values ('person', ${tenantAPersonId}, 'id-card.jpg', 'image/jpeg', 2048, ${ownerAPersonId})
    returning id
  `;
  personAttachmentId = attachment.id;
  // storage.objects rows can't be deleted over SQL (Storage API only) — CI's
  // database is throwaway, so this one is left behind deliberately.
  personObjectName = `person/${tenantAPersonId}/${randomUUID()}.jpg`;
  await adminSql`insert into storage.objects (bucket_id, name) values ('attachments', ${personObjectName})`;

  const [invite] = await adminSql`
    insert into invites (email, token_hash, role, person_id, invited_by, expires_at)
    values (${`tenant-a-${randomUUID()}@roi-test.example`}, 'x', 'tenant', ${tenantAPersonId}, ${ownerAPersonId}, now() + interval '7 days')
    returning id
  `;
  inviteAId = invite.id;

  // property_id deliberately omitted — the trigger derives it.
  const [auditTenancy] = await adminSql`
    insert into audit_log (entity_type, entity_id, actor_id, action, after)
    values ('tenancy', ${tenancyAId}, ${ownerAPersonId}, 'update', '{"note":"x"}')
    returning id
  `;
  auditTenancyAId = auditTenancy.id;
  const [auditPerson] = await adminSql`
    insert into audit_log (entity_type, entity_id, actor_id, action, after)
    values ('person', ${tenantAPersonId}, ${tenantAPersonId}, 'update', '{"phone":"x"}')
    returning id
  `;
  auditPersonAId = auditPerson.id;

  const [policy] = await adminSql`
    insert into field_policies (entity_type, field_name, policy, property_id)
    values ('person', 'phone', 'free', ${houseAId})
    returning id
  `;
  policyAId = policy.id;
});

afterAll(async () => {
  const houses = [houseAId, houseBId];
  const owners = [ownerAPersonId, ownerBPersonId];
  await adminSql`delete from audit_log where actor_id = any(${[...owners, tenantAPersonId]}::uuid[]) or entity_id = any(${[tenancyAId, tenantAPersonId]}::uuid[])`;
  await adminSql`delete from field_policies where property_id = any(${houses}::uuid[])`;
  await adminSql`delete from invites where invited_by = any(${owners}::uuid[]) or email like '%@roi-test.example'`;
  await adminSql`delete from attachments where entity_id = ${tenantAPersonId}`;
  await adminSql`delete from tenancy_occupants where tenancy_id = any(${[tenancyAId, tenancyBId]}::uuid[])`;
  await adminSql`delete from tenancies where id = any(${[tenancyAId, tenancyBId]}::uuid[])`;
  await adminSql`delete from property_ownership where property_id = any(${houses}::uuid[])`;
  await adminSql`delete from properties where root_property_id = any(${houses}::uuid[]) and parent_id is not null`;
  await adminSql`delete from properties where id = any(${houses}::uuid[])`;
  const userIds = [ownerAUserId, ownerBUserId, tenantAUserId];
  await adminSql`delete from profiles where id = any(${userIds}::uuid[])`;
  await adminSql`delete from auth.users where id = any(${userIds}::uuid[])`;
  await adminSql`update persons set managed_by_person_id = null where id = any(${createdPersonIds}::uuid[])`;
  await adminSql`delete from persons where id = any(${createdPersonIds}::uuid[])`;
  await adminSql.end();
});

describe("RLS: owner-to-owner isolation (migration 0032)", () => {
  it("persons: A sees self, its tenant and its unlinked person; B sees none of them", async () => {
    const ids = [ownerAPersonId, tenantAPersonId, unlinkedAPersonId];
    await asUser(ownerAUserId, async (tx) => {
      const rows = await tx`select id from persons where id in ${tx(ids)}`;
      expect(rows.map((r) => r.id).sort()).toEqual([...ids].sort());
    });
    await asUser(ownerBUserId, async (tx) => {
      const rows = await tx`select id from persons where id in ${tx(ids)}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("persons: B cannot edit A's tenant", async () => {
    await asUser(ownerBUserId, async (tx) => {
      const result = await tx`update persons set phone = '+36999' where id = ${tenantAPersonId}`;
      expect(result.count).toBe(0);
    });
    const [row] = await adminSql`select phone from persons where id = ${tenantAPersonId}`;
    expect(row.phone).toBeNull();
  });

  it("persons: a new person is managed by its creator, readable in the same INSERT…RETURNING, and invisible to the other owner", async () => {
    let newId = "";
    await asUser(ownerBUserId, async (tx) => {
      const [row] = await tx`
        insert into persons (given_name, family_name) values (${TAG}, 'Created by B')
        returning id, managed_by_person_id
      `;
      expect(row.managed_by_person_id).toBe(ownerBPersonId);
      newId = row.id;
    });
    createdPersonIds.push(newId);
    await asUser(ownerAUserId, async (tx) => {
      expect(await tx`select id from persons where id = ${newId}`).toHaveLength(0);
    });
  });

  it("persons: an owner cannot create a person 'managed by' someone else", async () => {
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into persons (given_name, family_name, managed_by_person_id) values (${TAG}, 'Planted', ${ownerAPersonId})
    `);
  });

  it("property_ownership: B cannot repoint its own ownership row at A's house", async () => {
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      update property_ownership set property_id = ${houseAId} where person_id = ${ownerBPersonId}
    `);
    const rows = await adminSql`select property_id from property_ownership where person_id = ${ownerBPersonId}`;
    expect(rows.map((r) => r.property_id)).toEqual([houseBId]);
  });

  it("property_ownership: A can still update its own row in place", async () => {
    await asUser(ownerAUserId, async (tx) => {
      const result = await tx`update property_ownership set percentage = 100 where person_id = ${ownerAPersonId}`;
      expect(result.count).toBe(1);
    });
  });

  it("links: B cannot attach A's tenant to its own flat (tenancy, occupant, co-owner)", async () => {
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into tenancies (unit_id, primary_tenant_id, term_start, status)
      values (${flatBId}, ${tenantAPersonId}, '2026-02-01', 'active')
    `);
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into tenancy_occupants (tenancy_id, person_id, relationship)
      values (${tenancyBId}, ${tenantAPersonId}, 'co_occupant')
    `);
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into property_ownership (property_id, person_id, percentage) values (${houseBId}, ${tenantAPersonId}, 0)
    `);
  });

  it("links: B can still link its own people", async () => {
    await asUser(ownerBUserId, async (tx) => {
      const [row] = await tx`
        insert into tenancy_occupants (tenancy_id, person_id, relationship)
        values (${tenancyBId}, ${tenantBPersonId}, 'co_occupant')
        returning id
      `;
      expect(row.id).toBeTruthy();
    });
  });

  it("invites: A sees its invite, B doesn't; B cannot bind an invite to A's tenant or sign as A", async () => {
    await asUser(ownerAUserId, async (tx) => {
      expect(await tx`select id from invites where id = ${inviteAId}`).toHaveLength(1);
    });
    await asUser(ownerBUserId, async (tx) => {
      expect(await tx`select id from invites where id = ${inviteAId}`).toHaveLength(0);
    });
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into invites (email, token_hash, role, person_id, invited_by, expires_at)
      values (${`hijack-${randomUUID()}@roi-test.example`}, 'x', 'tenant', ${tenantAPersonId}, ${ownerBPersonId}, now() + interval '1 day')
    `);
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into invites (email, token_hash, role, invited_by, expires_at)
      values (${`spoof-${randomUUID()}@roi-test.example`}, 'x', 'tenant', ${ownerAPersonId}, now() + interval '1 day')
    `);
  });

  it("person attachments and ID-scan objects: visible to A, not to B", async () => {
    await asUser(ownerAUserId, async (tx) => {
      expect(await tx`select id from attachments where id = ${personAttachmentId}`).toHaveLength(1);
      expect(await tx`select id from storage.objects where bucket_id = 'attachments' and name = ${personObjectName}`).toHaveLength(1);
    });
    await asUser(ownerBUserId, async (tx) => {
      expect(await tx`select id from attachments where id = ${personAttachmentId}`).toHaveLength(0);
      expect(await tx`select id from storage.objects where bucket_id = 'attachments' and name = ${personObjectName}`).toHaveLength(0);
    });
  });

  it("audit_log: the trigger derives property_id; A sees its rows incl. the tenant's self-edit, B sees none", async () => {
    const [row] = await adminSql`select property_id from audit_log where id = ${auditTenancyAId}`;
    expect(row.property_id).toBe(houseAId);

    const ids = [auditTenancyAId, auditPersonAId];
    await asUser(ownerAUserId, async (tx) => {
      const rows = await tx`select id from audit_log where id in ${tx(ids)}`;
      expect(rows).toHaveLength(2);
    });
    await asUser(ownerBUserId, async (tx) => {
      expect(await tx`select id from audit_log where id in ${tx(ids)}`).toHaveLength(0);
    });
  });

  it("audit_log: B cannot forge history on A's property, nor record someone else as actor", async () => {
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into audit_log (entity_type, entity_id, actor_id, action) values ('tenancy', ${tenancyAId}, ${ownerBPersonId}, 'update')
    `);
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into audit_log (entity_type, entity_id, actor_id, action) values ('tenancy', ${tenancyBId}, ${ownerAPersonId}, 'update')
    `);
    await asUser(ownerBUserId, async (tx) => {
      const [row] = await tx`
        insert into audit_log (entity_type, entity_id, actor_id, action) values ('tenancy', ${tenancyBId}, ${ownerBPersonId}, 'update')
        returning property_id
      `;
      expect(row.property_id).toBe(houseBId);
    });
  });

  it("field_policies: per property — A and A's tenant read A's row, B neither reads nor writes it", async () => {
    await asUser(ownerAUserId, async (tx) => {
      expect(await tx`select id from field_policies where id = ${policyAId}`).toHaveLength(1);
    });
    await asUser(tenantAUserId, async (tx) => {
      expect(await tx`select id from field_policies where id = ${policyAId}`).toHaveLength(1);
      // Built-in defaults stay readable to everyone.
      expect((await tx`select id from field_policies where property_id is null`).length).toBeGreaterThan(0);
    });
    await asUser(ownerBUserId, async (tx) => {
      expect(await tx`select id from field_policies where id = ${policyAId}`).toHaveLength(0);
      const result = await tx`update field_policies set policy = 'read_only' where id = ${policyAId}`;
      expect(result.count).toBe(0);
    });
    await expectRlsRejection(ownerBUserId, (tx) => tx`
      insert into field_policies (entity_type, field_name, policy, property_id) values ('person', 'dob', 'free', ${houseAId})
    `);
    // Built-in defaults are read-only for every app user, owners included.
    await asUser(ownerAUserId, async (tx) => {
      const result = await tx`
        update field_policies set policy = 'read_only'
        where property_id is null and entity_type = 'person' and field_name = 'phone'
      `;
      expect(result.count).toBe(0);
    });
  });
});

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. Mirrors the asUser/adminSql
// pattern in rls-contracts-isolation.test.ts / rls-deposit-isolation.test.ts,
// extended to the Phase 2 attachments table + policies (migration 0017).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let flatAId: string;
let personAId: string;
let userAId: string;
let tenancyAId: string;
let tenancyAttachmentId: string;
let tenancyAttachmentDeletedId: string;
let personAAttachmentId: string;

// A second, unrelated tenancy/person — negative controls for tenant
// scoping (person A must not see tenancy B's or person B's attachments).
let tenancyBId: string;
let personBId: string;

// Owns houseId — exercises owner_scope_attachments / owner_insert_attachments
// for entity_type = 'tenancy'.
let ownerUserId: string;
let ownerPersonId: string;
// Owns nothing — negative control for owner scoping on 'tenancy' rows.
// Still an owner, so (per owner_scope_persons' own "any owner manages
// every person record" design, migration 0001) it DOES see 'person' rows —
// that asymmetry is intentional and asserted below, not a bug.
let strangerOwnerUserId: string;
let strangerOwnerPersonId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

// attachments has GRANT SELECT/INSERT/UPDATE but no tenant UPDATE policy —
// same "silently affects 0 rows" shape as contracts' tenant update test
// (migration 0015), safe to assert directly here since the GRANT (unlike
// deposit_transactions' append-only design) is present in every
// environment, not just the dev-cloud project's legacy blanket grant.
async function expectUpdateDenied(userId: string, query: (tx: postgres.TransactionSql) => Promise<{ count: number }>) {
  await asUser(userId, async (tx) => {
    const result = await query(tx);
    expect(result.count).toBe(0);
  });
}

beforeAll(async () => {
  houseId = randomUUID();
  await adminSql`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${houseId}, ${houseId}, null, 'house', 'RAI Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RAI Test Flat A', 'whole', true)
    returning id
  `;
  flatAId = flatA.id;

  const [personA] = await adminSql`
    insert into persons (given_name, family_name) values ('RAI Test', 'Tenant A') returning id
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

  const [tenancyAttachment] = await adminSql`
    insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
    values ('tenancy', ${tenancyAId}, 'lease-note.pdf', 'application/pdf', 1024, ${personAId})
    returning id
  `;
  tenancyAttachmentId = tenancyAttachment.id;

  const [tenancyAttachmentDeleted] = await adminSql`
    insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by, deleted_at)
    values ('tenancy', ${tenancyAId}, 'removed.pdf', 'application/pdf', 512, ${personAId}, now())
    returning id
  `;
  tenancyAttachmentDeletedId = tenancyAttachmentDeleted.id;

  const [personAAttachment] = await adminSql`
    insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
    values ('person', ${personAId}, 'id-card.jpg', 'image/jpeg', 2048, ${personAId})
    returning id
  `;
  personAAttachmentId = personAAttachment.id;

  // Unrelated tenancy B + person B on the same property tree, purely as
  // negative controls — tenant A must never see either's attachments.
  const [personB] = await adminSql`
    insert into persons (given_name, family_name) values ('RAI Test', 'Tenant B') returning id
  `;
  personBId = personB.id;
  const [flatB] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RAI Test Flat B', 'whole', true)
    returning id
  `;
  const [tenancyB] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatB.id}, ${personBId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyBId = tenancyB.id;
  await adminSql`
    insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
    values ('tenancy', ${tenancyBId}, 'other-lease.pdf', 'application/pdf', 1024, ${personBId})
  `;
  await adminSql`
    insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
    values ('person', ${personBId}, 'other-id-card.jpg', 'image/jpeg', 2048, ${personBId})
  `;

  const [ownerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RAI Test', 'Owner') returning id
  `;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;

  const [strangerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RAI Test', 'Stranger Owner') returning id
  `;
  strangerOwnerPersonId = strangerPerson.id;
  strangerOwnerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${strangerOwnerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${strangerOwnerUserId}, ${strangerOwnerPersonId}, 'owner', 'hu')`;
});

afterAll(async () => {
  await adminSql`delete from attachments where entity_id in (${tenancyAId}, ${tenancyBId}, ${personAId}, ${personBId})`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from tenancies where id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from profiles where id = ${userAId}`;
  await adminSql`delete from persons where id in (${personAId}, ${personBId})`;
  await adminSql`delete from properties where name like 'RAI Test%'`;
  await adminSql`delete from auth.users where id = ${userAId}`;
  await adminSql.end();
});

describe("RLS: attachments isolation (migration 0017)", () => {
  it("a tenant sees their own tenancy's non-deleted attachments only", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from attachments where entity_type = 'tenancy' and entity_id = ${tenancyAId}`;
      expect(rows.map((r) => r.id)).toEqual([tenancyAttachmentId]);
      expect(rows.map((r) => r.id)).not.toContain(tenancyAttachmentDeletedId);

      const foreign = await tx`select id from attachments where entity_id = ${tenancyBId}`;
      expect(foreign).toHaveLength(0);
    });
  });

  it("a tenant sees their own person attachments only, not another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from attachments where entity_type = 'person' and entity_id = ${personAId}`;
      expect(own.map((r) => r.id)).toEqual([personAAttachmentId]);

      const foreign = await tx`select id from attachments where entity_type = 'person' and entity_id = ${personBId}`;
      expect(foreign).toHaveLength(0);
    });
  });

  it("a tenant cannot insert an attachment", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
          values ('tenancy', ${tenancyAId}, 'sneaky.pdf', 'application/pdf', 1, ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant's update (soft-delete attempt) silently affects no rows", async () => {
    await expectUpdateDenied(
      userAId,
      (tx) => tx`update attachments set deleted_at = now() where id = ${tenancyAttachmentId}`,
    );
    const [after] = await adminSql`select deleted_at from attachments where id = ${tenancyAttachmentId}`;
    expect(after.deleted_at).toBeNull();
  });

  it("the owning owner sees tenancy attachments (incl. soft-deleted); a stranger owner sees none", async () => {
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from attachments where entity_type = 'tenancy' and entity_id = ${tenancyAId}`;
      expect(rows).toHaveLength(2);
    });
    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from attachments where entity_type = 'tenancy' and entity_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("any owner sees person attachments regardless of property ownership (mirrors owner_scope_persons)", async () => {
    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from attachments where entity_type = 'person' and entity_id = ${personAId}`;
      expect(rows.map((r) => r.id)).toEqual([personAAttachmentId]);
    });
  });

  it("the owning owner can insert and soft-delete a tenancy attachment on their own property", async () => {
    let insertedId: string | undefined;
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
        values ('tenancy', ${tenancyAId}, 'owner-upload.pdf', 'application/pdf', 100, ${ownerPersonId})
        returning id
      `;
      insertedId = row.id;
      await tx`update attachments set deleted_at = now() where id = ${row.id}`;
    });
    expect(insertedId).toBeTruthy();
    const [after] = await adminSql`select deleted_at from attachments where id = ${insertedId!}`;
    expect(after.deleted_at).not.toBeNull();
    await adminSql`delete from attachments where id = ${insertedId!}`;
  });

  it("a stranger owner cannot insert a tenancy attachment on a tenancy they don't own", async () => {
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`
          insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
          values ('tenancy', ${tenancyAId}, 'sneaky-owner.pdf', 'application/pdf', 1, ${strangerOwnerPersonId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("property_id is trigger-set from the tenancy's root property for 'tenancy' rows, and stays null for 'person' rows", async () => {
    const [tenancyRow] = await adminSql`select property_id from attachments where id = ${tenancyAttachmentId}`;
    expect(tenancyRow.property_id).toBe(houseId);

    const [personRow] = await adminSql`select property_id from attachments where id = ${personAAttachmentId}`;
    expect(personRow.property_id).toBeNull();
  });
});

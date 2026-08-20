import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Same asUser/adminSql pattern as rls-requests-isolation.test.ts, extended
// to the Phase 3 item 2 notices tables + policies (migration 0020).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let flatAId: string;
let flatBId: string;
let personAId: string;
let userAId: string;
let tenancyAId: string;
let tenancyBId: string;
let personBId: string;
let userBId: string;

let ackNoticeAId: string; // requires_acknowledgement = true, tenancy A, not yet acknowledged
let plainNoticeAId: string; // requires_acknowledgement = false, tenancy A
let noticeBId: string; // requires_acknowledgement = true, tenancy B

let ownerUserId: string;
let ownerPersonId: string;
let strangerOwnerUserId: string;
let strangerOwnerPersonId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

// RLS denial can surface either as a silent 0-row UPDATE (the row never
// matched any policy's USING clause, or matched USING but failed every
// applicable WITH CHECK) or a thrown "new row violates row-level security
// policy"/guard-trigger exception — both are valid denial shapes, see
// project memory flatlord_authenticated_role_grants.
async function expectUpdateDenied(userId: string, query: (tx: postgres.TransactionSql) => Promise<{ count: number }>) {
  try {
    await asUser(userId, async (tx) => {
      const result = await query(tx);
      expect(result.count).toBe(0);
    });
  } catch (err) {
    expect(String(err)).toMatch(/row-level security|permission denied|immutable/i);
  }
}

beforeAll(async () => {
  houseId = randomUUID();
  await adminSql`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${houseId}, ${houseId}, null, 'house', 'RRI Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RRI Test Flat A', 'whole', true)
    returning id
  `;
  flatAId = flatA.id;
  const [flatB] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RRI Test Flat B', 'whole', true)
    returning id
  `;
  flatBId = flatB.id;

  const [personA] = await adminSql`insert into persons (given_name, family_name) values ('RRI Test', 'Tenant A') returning id`;
  personAId = personA.id;
  userAId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;

  const [personB] = await adminSql`insert into persons (given_name, family_name) values ('RRI Test', 'Tenant B') returning id`;
  personBId = personB.id;
  userBId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userBId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userBId}, ${personBId}, 'tenant', 'hu')`;

  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatAId}, ${personAId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyAId = tenancyA.id;
  const [tenancyB] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatBId}, ${personBId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyBId = tenancyB.id;

  const [ownerPerson] = await adminSql`insert into persons (given_name, family_name) values ('RRI Test', 'Owner') returning id`;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;

  const [strangerPerson] = await adminSql`insert into persons (given_name, family_name) values ('RRI Test', 'Stranger Owner') returning id`;
  strangerOwnerPersonId = strangerPerson.id;
  strangerOwnerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${strangerOwnerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${strangerOwnerUserId}, ${strangerOwnerPersonId}, 'owner', 'hu')`;

  const [ackNoticeA] = await adminSql`
    insert into notices (tenancy_id, type, title, body, requires_acknowledgement, issued_by)
    values (${tenancyAId}, 'formal_warning', 'RRI first warning', 'RRI noise complaint', true, ${ownerPersonId})
    returning id
  `;
  ackNoticeAId = ackNoticeA.id;

  const [plainNoticeA] = await adminSql`
    insert into notices (tenancy_id, type, title, body, requires_acknowledgement, issued_by)
    values (${tenancyAId}, 'info', 'RRI heads up', 'RRI just an fyi', false, ${ownerPersonId})
    returning id
  `;
  plainNoticeAId = plainNoticeA.id;

  const [noticeB] = await adminSql`
    insert into notices (tenancy_id, type, title, body, requires_acknowledgement, issued_by)
    values (${tenancyBId}, 'formal_warning', 'RRI B warning', 'RRI B body', true, ${ownerPersonId})
    returning id
  `;
  noticeBId = noticeB.id;
});

afterAll(async () => {
  await adminSql`
    delete from attachments
    where entity_type = 'notice'
      and entity_id in (select id from notices where tenancy_id in (${tenancyAId}, ${tenancyBId}))
  `;
  await adminSql`delete from notices where tenancy_id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId}, ${userAId}, ${userBId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId}, ${userAId}, ${userBId})`;
  await adminSql`delete from tenancies where id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from persons where id in (${personAId}, ${personBId})`;
  // Deliberately scoped to exactly the ids this file created (not a
  // `name like 'RRI Test%'` sweep like some sibling RLS test files use) —
  // vitest runs test files concurrently, and every RLS test file seeds a
  // property literally named "RRI Test House"/"RRI Test Flat A/B" with
  // its own random id; a name-pattern delete here raced a sibling file's
  // still-in-use rows and hit a property_ownership FK violation.
  await adminSql`delete from properties where id in (${houseId}, ${flatAId}, ${flatBId})`;
  await adminSql.end();
});

describe("RLS: notices isolation (migration 0020)", () => {
  it("a tenant sees only their own tenancy's notices", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from notices where tenancy_id = ${tenancyAId}`;
      expect(own.map((r) => r.id).sort()).toEqual([ackNoticeAId, plainNoticeAId].sort());
      const foreign = await tx`select id from notices where id = ${noticeBId}`;
      expect(foreign).toHaveLength(0);
    });
  });

  it("a tenant cannot insert a notice at all — issuing is owner-only", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into notices (tenancy_id, type, title, body, requires_acknowledgement, issued_by)
          values (${tenancyAId}, 'info', 'RRI sneaky', 'RRI sneaky body', false, ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant cannot edit a notice's content (title), even one that's otherwise eligible for acknowledgement", async () => {
    await expectUpdateDenied(userAId, (tx) => tx`update notices set title = 'RRI hacked' where id = ${ackNoticeAId}`);
    const [after] = await adminSql`select title from notices where id = ${ackNoticeAId}`;
    expect(after.title).toBe("RRI first warning");
  });

  it("a tenant cannot smuggle a content change through the acknowledge path — the guard trigger rejects it even though RLS would otherwise allow the ack", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          update notices
          set acknowledged_at = now(), acknowledged_by = ${personAId}, title = 'RRI hacked via ack'
          where id = ${ackNoticeAId}
        `;
      }),
    ).rejects.toThrow(/immutable/i);
    const [after] = await adminSql`select title, acknowledged_at from notices where id = ${ackNoticeAId}`;
    expect(after.title).toBe("RRI first warning");
    expect(after.acknowledged_at).toBeNull();
  });

  it("a tenant cannot acknowledge a notice that doesn't require acknowledgement", async () => {
    await expectUpdateDenied(
      userAId,
      (tx) => tx`update notices set acknowledged_at = now(), acknowledged_by = ${personAId} where id = ${plainNoticeAId}`,
    );
    const [after] = await adminSql`select acknowledged_at from notices where id = ${plainNoticeAId}`;
    expect(after.acknowledged_at).toBeNull();
  });

  it("a tenant cannot acknowledge on someone else's behalf (acknowledged_by must be their own person_id)", async () => {
    await expectUpdateDenied(
      userAId,
      (tx) => tx`update notices set acknowledged_at = now(), acknowledged_by = ${ownerPersonId} where id = ${ackNoticeAId}`,
    );
    const [after] = await adminSql`select acknowledged_at from notices where id = ${ackNoticeAId}`;
    expect(after.acknowledged_at).toBeNull();
  });

  it("a tenant cannot acknowledge a foreign tenancy's notice", async () => {
    await expectUpdateDenied(
      userAId,
      (tx) => tx`update notices set acknowledged_at = now(), acknowledged_by = ${personAId} where id = ${noticeBId}`,
    );
    const [after] = await adminSql`select acknowledged_at from notices where id = ${noticeBId}`;
    expect(after.acknowledged_at).toBeNull();
  });

  it("a tenant CAN acknowledge their own notice that requires it, setting only acknowledged_at/acknowledged_by", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`
        update notices set acknowledged_at = now(), acknowledged_by = ${personAId} where id = ${ackNoticeAId}
      `;
      expect(result.count).toBe(1);
    });
    const [after] = await adminSql`select acknowledged_at, acknowledged_by, title, body from notices where id = ${ackNoticeAId}`;
    expect(after.acknowledged_at).not.toBeNull();
    expect(after.acknowledged_by).toBe(personAId);
    expect(after.title).toBe("RRI first warning");
    expect(after.body).toBe("RRI noise complaint");
  });

  it("a tenant cannot re-acknowledge an already-acknowledged notice", async () => {
    await expectUpdateDenied(
      userAId,
      (tx) => tx`update notices set acknowledged_at = now(), acknowledged_by = ${personAId} where id = ${ackNoticeAId}`,
    );
  });

  it("the owning owner sees/inserts notices on their property; a stranger owner sees none and cannot insert", async () => {
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from notices where tenancy_id = ${tenancyAId}`;
      expect(rows.map((r) => r.id)).toContain(ackNoticeAId);
    });

    let ownerInsertedId: string | undefined;
    await asUser(ownerUserId, async (tx) => {
      const [inserted] = await tx`
        insert into notices (tenancy_id, type, title, body, requires_acknowledgement, issued_by)
        values (${tenancyAId}, 'house_rule', 'RRI owner-issued', 'RRI body', false, ${ownerPersonId})
        returning id
      `;
      expect(inserted.id).toBeTruthy();
      ownerInsertedId = inserted.id;
    });
    if (ownerInsertedId) await adminSql`delete from notices where id = ${ownerInsertedId}`;

    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from notices where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`
          insert into notices (tenancy_id, type, title, body, requires_acknowledgement, issued_by)
          values (${tenancyAId}, 'info', 'RRI sneaky-owner', 'RRI body', false, ${strangerOwnerPersonId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("the owner has no update path at all — notices are insert-only for owners, immutable once issued", async () => {
    await expectUpdateDenied(ownerUserId, (tx) => tx`update notices set title = 'RRI owner-hacked' where id = ${plainNoticeAId}`);
    const [after] = await adminSql`select title from notices where id = ${plainNoticeAId}`;
    expect(after.title).toBe("RRI heads up");
  });

  it("property_id is trigger-set from the tenancy's property", async () => {
    const [row] = await adminSql`select property_id from notices where id = ${ackNoticeAId}`;
    expect(row.property_id).toBe(houseId);
  });

  it("attachments: the owning owner can attach + see documents within their property scope for entity_type = 'notice'", async () => {
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
        values ('notice', ${ackNoticeAId}, 'evidence.jpg', 'image/jpeg', 100, ${ownerPersonId})
        returning id
      `;
      expect(row.id).toBeTruthy();
      const rows = await tx`select id from attachments where entity_type = 'notice' and entity_id = ${ackNoticeAId}`;
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("attachments: a stranger owner cannot attach to a notice outside their scope", async () => {
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`
          insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
          values ('notice', ${ackNoticeAId}, 'sneaky.jpg', 'image/jpeg', 100, ${strangerOwnerPersonId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("attachments: a tenant can read (but not insert) attachments on their own notice", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from attachments where entity_type = 'notice' and entity_id = ${ackNoticeAId}`;
      expect(rows.length).toBeGreaterThan(0);
    });
    // No tenant_insert_attachments_notices policy exists — a notice is
    // admin-issued and immutable, so there is nothing for a tenant to add.
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
          values ('notice', ${ackNoticeAId}, 'tenant-sneaky.jpg', 'image/jpeg', 100, ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("attachments: a tenant cannot read attachments on a foreign tenancy's notice", async () => {
    await asUser(ownerUserId, async (tx) => {
      await tx`
        insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
        values ('notice', ${noticeBId}, 'b-evidence.jpg', 'image/jpeg', 100, ${ownerPersonId})
      `;
    });
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from attachments where entity_type = 'notice' and entity_id = ${noticeBId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("attachments: property_id is trigger-set from the notice's own property_id for entity_type = 'notice'", async () => {
    const [row] = await adminSql`
      select property_id from attachments where entity_type = 'notice' and entity_id = ${ackNoticeAId} limit 1
    `;
    expect(row.property_id).toBe(houseId);
  });
});

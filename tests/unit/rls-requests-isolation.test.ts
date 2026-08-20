import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Same asUser/adminSql pattern as rls-inventory-isolation.test.ts,
// extended to the Phase 3 item 1 requests tables + policies
// (migration 0019).
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

let requestAId: string;
let requestBId: string;
let messageAId: string;

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
// matched any policy's USING clause) or a thrown "new row violates
// row-level security policy" error (the row matched a USING clause but
// failed every applicable WITH CHECK for the target values) — both are
// valid denial shapes, see project memory flatlord_authenticated_role_grants.
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

  const [requestA] = await adminSql`
    insert into requests (tenancy_id, category, status, title, initiated_by)
    values (${tenancyAId}, 'repair', 'open', 'RRI leaky tap', ${personAId})
    returning id
  `;
  requestAId = requestA.id;
  const [requestB] = await adminSql`
    insert into requests (tenancy_id, category, status, title, initiated_by)
    values (${tenancyBId}, 'repair', 'open', 'RRI broken window', ${personBId})
    returning id
  `;
  requestBId = requestB.id;

  const [messageA] = await adminSql`
    insert into request_messages (request_id, author_id, body)
    values (${requestAId}, ${personAId}, 'RRI initial description')
    returning id
  `;
  messageAId = messageA.id;

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
});

afterAll(async () => {
  // Delete everything scoped to tenancy A/B, not just the two seeded
  // request ids — several tests insert additional requests/messages
  // (tenant self-insert, owner-logged call) that must also be cleaned up
  // before the tenancies FK can be dropped.
  await adminSql`
    delete from attachments
    where entity_type = 'request'
      and entity_id in (select id from requests where tenancy_id in (${tenancyAId}, ${tenancyBId}))
  `;
  await adminSql`
    delete from request_messages
    where request_id in (select id from requests where tenancy_id in (${tenancyAId}, ${tenancyBId}))
  `;
  await adminSql`delete from requests where tenancy_id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId}, ${userAId}, ${userBId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId}, ${userAId}, ${userBId})`;
  await adminSql`delete from tenancies where id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from persons where id in (${personAId}, ${personBId})`;
  await adminSql`delete from properties where name like 'RRI Test%'`;
  await adminSql.end();
});

describe("RLS: requests isolation (migration 0019)", () => {
  it("a tenant sees only their own tenancy's requests, and can insert on it", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from requests where id = ${requestAId}`;
      expect(own.map((r) => r.id)).toEqual([requestAId]);
      const foreign = await tx`select id from requests where id = ${requestBId}`;
      expect(foreign).toHaveLength(0);

      const [inserted] = await tx`
        insert into requests (tenancy_id, category, status, title, initiated_by)
        values (${tenancyAId}, 'other', 'open', 'RRI tenant-inserted', ${personAId})
        returning id
      `;
      expect(inserted.id).toBeTruthy();
    });
  });

  it("a tenant cannot insert a request for a foreign tenancy", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into requests (tenancy_id, category, status, title, initiated_by)
          values (${tenancyBId}, 'other', 'open', 'RRI sneaky', ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant can withdraw their own open request, but not resolve/reject it", async () => {
    await asUser(userAId, async (tx) => {
      await tx`update requests set status = 'withdrawn' where id = ${requestAId}`;
    });
    const [afterWithdraw] = await adminSql`select status from requests where id = ${requestAId}`;
    expect(afterWithdraw.status).toBe("withdrawn");

    // Reset for subsequent tests.
    await adminSql`update requests set status = 'open' where id = ${requestAId}`;

    await expectUpdateDenied(userAId, (tx) => tx`update requests set status = 'resolved' where id = ${requestAId}`);
    const [afterResolveAttempt] = await adminSql`select status from requests where id = ${requestAId}`;
    expect(afterResolveAttempt.status).toBe("open");

    await expectUpdateDenied(userAId, (tx) => tx`update requests set status = 'rejected' where id = ${requestAId}`);
  });

  it("a tenant cannot withdraw a request that isn't theirs", async () => {
    await expectUpdateDenied(userAId, (tx) => tx`update requests set status = 'withdrawn' where id = ${requestBId}`);
    const [after] = await adminSql`select status from requests where id = ${requestBId}`;
    expect(after.status).toBe("open");
  });

  it("a tenant cannot withdraw a request that isn't open", async () => {
    await adminSql`update requests set status = 'resolved' where id = ${requestBId}`;
    await asUser(userBId, async (tx) => {
      const result = await tx`update requests set status = 'withdrawn' where id = ${requestBId}`;
      expect(result.count).toBe(0);
    });
    const [after] = await adminSql`select status from requests where id = ${requestBId}`;
    expect(after.status).toBe("resolved");
    // Reset for subsequent tests.
    await adminSql`update requests set status = 'open' where id = ${requestBId}`;
  });

  it("the owning owner sees/resolves requests on their property; a stranger owner sees none and cannot insert", async () => {
    // Note: ownerUserId's property_ownership is on houseId, the shared
    // root property of both flatA and flatB (same setup as
    // rls-inventory-isolation.test.ts), so this owner legitimately owns
    // both tenancies — the negative case ("owns nothing relevant") is
    // covered by strangerOwnerUserId below, not by excluding tenancy B here.
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from requests where tenancy_id = ${tenancyAId}`;
      expect(rows.map((r) => r.id)).toContain(requestAId);
      await tx`update requests set status = 'resolved' where id = ${requestAId}`;
    });
    const [after] = await adminSql`select status from requests where id = ${requestAId}`;
    expect(after.status).toBe("resolved");
    // Reset.
    await adminSql`update requests set status = 'open' where id = ${requestAId}`;

    let ownerInsertedId: string | undefined;
    await asUser(ownerUserId, async (tx) => {
      const [inserted] = await tx`
        insert into requests (tenancy_id, category, status, title, initiated_by)
        values (${tenancyAId}, 'repair', 'open', 'RRI owner-logged call', ${ownerPersonId})
        returning id
      `;
      expect(inserted.id).toBeTruthy();
      ownerInsertedId = inserted.id;
    });
    if (ownerInsertedId) await adminSql`delete from requests where id = ${ownerInsertedId}`;

    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from requests where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`
          insert into requests (tenancy_id, category, status, title, initiated_by)
          values (${tenancyAId}, 'repair', 'open', 'RRI sneaky-owner', ${strangerOwnerPersonId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("property_id is trigger-set from the tenancy's property", async () => {
    const [row] = await adminSql`select property_id from requests where id = ${requestAId}`;
    expect(row.property_id).toBe(houseId);
  });

  it("attachments: a tenant can attach a document on their own request, not on another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const [row] = await tx`
        insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
        values ('request', ${requestAId}, 'photo.jpg', 'image/jpeg', 100, ${personAId})
        returning id
      `;
      expect(row.id).toBeTruthy();
      const own = await tx`select id from attachments where entity_type = 'request' and entity_id = ${requestAId}`;
      expect(own.map((r) => r.id)).toContain(row.id);
    });

    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
          values ('request', ${requestBId}, 'sneaky.jpg', 'image/jpeg', 100, ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("attachments: the owning owner can attach + see documents within their property scope", async () => {
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into attachments (entity_type, entity_id, file_name, mime_type, size_bytes, uploaded_by)
        values ('request', ${requestAId}, 'quote.pdf', 'application/pdf', 200, ${ownerPersonId})
        returning id
      `;
      expect(row.id).toBeTruthy();
      const rows = await tx`select id from attachments where entity_type = 'request' and entity_id = ${requestAId}`;
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("attachments: property_id is trigger-set from the request's own property_id for entity_type = 'request'", async () => {
    const [row] = await adminSql`
      select property_id from attachments where entity_type = 'request' and entity_id = ${requestAId} limit 1
    `;
    expect(row.property_id).toBe(houseId);
  });

  it("request_messages: a tenant can insert/read on their own request's thread", async () => {
    await asUser(userAId, async (tx) => {
      const [row] = await tx`
        insert into request_messages (request_id, author_id, body) values (${requestAId}, ${personAId}, 'RRI tenant reply')
        returning id
      `;
      expect(row.id).toBeTruthy();
      const own = await tx`select id from request_messages where id = ${messageAId}`;
      expect(own.map((r) => r.id)).toEqual([messageAId]);
    });
  });

  it("request_messages: tenant B cannot see or post into tenant A's thread (transitive scoping via the parent request's own RLS)", async () => {
    await asUser(userBId, async (tx) => {
      const foreign = await tx`select id from request_messages where request_id = ${requestAId}`;
      expect(foreign).toHaveLength(0);
    });

    await expect(
      asUser(userBId, async (tx) => {
        await tx`insert into request_messages (request_id, author_id, body) values (${requestAId}, ${personBId}, 'RRI sneaky reply')`;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("request_messages: the owning owner can read/post on requests within their property scope; a stranger owner cannot", async () => {
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from request_messages where request_id = ${requestAId}`;
      expect(rows.length).toBeGreaterThan(0);
      const [row] = await tx`
        insert into request_messages (request_id, author_id, body) values (${requestAId}, ${ownerPersonId}, 'RRI owner reply')
        returning id
      `;
      expect(row.id).toBeTruthy();
    });

    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from request_messages where request_id = ${requestAId}`;
      expect(rows).toHaveLength(0);
    });
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`insert into request_messages (request_id, author_id, body) values (${requestAId}, ${strangerOwnerPersonId}, 'RRI sneaky-owner reply')`;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });
});

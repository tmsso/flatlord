import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Same asUser/adminSql pattern as rls-field-editability-isolation.test.ts,
// extended to the notifications table + profiles.notification_prefs
// self-update policy (migration 0022).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let personAId: string;
let userAId: string;
let personBId: string;
let userBId: string;
let notificationAId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

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
  const [personA] = await adminSql`insert into persons (given_name, family_name) values ('RNI Test', 'Tenant A') returning id`;
  personAId = personA.id;
  userAId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;

  const [personB] = await adminSql`insert into persons (given_name, family_name) values ('RNI Test', 'Tenant B') returning id`;
  personBId = personB.id;
  userBId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userBId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userBId}, ${personBId}, 'tenant', 'hu')`;

  const [notificationA] = await adminSql`
    insert into notifications (recipient_profile_id, category, title) values (${userAId}, 'request', 'RNI test notification')
    returning id
  `;
  notificationAId = notificationA.id;
});

afterAll(async () => {
  await adminSql`delete from notifications where recipient_profile_id in (${userAId}, ${userBId})`;
  await adminSql`delete from profiles where id in (${userAId}, ${userBId})`;
  await adminSql`delete from persons where id in (${personAId}, ${personBId})`;
  await adminSql`delete from auth.users where id in (${userAId}, ${userBId})`;
  await adminSql.end();
});

describe("RLS: notification centre isolation (migration 0022)", () => {
  it("a user sees only their own notifications", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from notifications where id = ${notificationAId}`;
      expect(own.map((r) => r.id)).toEqual([notificationAId]);
    });
    await asUser(userBId, async (tx) => {
      const foreign = await tx`select id from notifications where id = ${notificationAId}`;
      expect(foreign).toHaveLength(0);
    });
  });

  it("a user can mark their own notification read, not another's", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`update notifications set read_at = now() where id = ${notificationAId}`;
      expect(result.count).toBe(1);
    });
    const [after] = await adminSql`select read_at from notifications where id = ${notificationAId}`;
    expect(after.read_at).not.toBeNull();

    await adminSql`update notifications set read_at = null where id = ${notificationAId}`;
    await expectUpdateDenied(userBId, (tx) => tx`update notifications set read_at = now() where id = ${notificationAId}`);
    const [afterDenied] = await adminSql`select read_at from notifications where id = ${notificationAId}`;
    expect(afterDenied.read_at).toBeNull();
  });

  it("a user cannot insert their own notification row (system-generated only, no INSERT grant)", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`insert into notifications (recipient_profile_id, category, title) values (${userAId}, 'request', 'RNI sneaky')`;
      }),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it("a user can update their own notification_prefs column on profiles, not another user's", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`update profiles set notification_prefs = '{"request": {"email": false}}'::jsonb where id = ${userAId}`;
      expect(result.count).toBe(1);
    });
    const [after] = await adminSql`select notification_prefs from profiles where id = ${userAId}`;
    expect(after.notification_prefs).toEqual({ request: { email: false } });

    await expectUpdateDenied(userAId, (tx) => tx`update profiles set notification_prefs = '{}'::jsonb where id = ${userBId}`);
  });

  it("self_update_profiles' WITH CHECK blocks smuggling a role change into the same update, even on the caller's own row", async () => {
    // A column-level GRANT restriction was tried first and doesn't work on
    // this platform (see migration 0022's comment) — the real gate is
    // this WITH CHECK comparing role against its own already-stored value.
    await expectUpdateDenied(userAId, (tx) => tx`update profiles set role = 'owner' where id = ${userAId}`);
    const [after] = await adminSql`select role from profiles where id = ${userAId}`;
    expect(after.role).toBe("tenant");
  });

  it("self_update_profiles still allows a plain notification_prefs-only update alongside the unchanged role/person_id it re-checks", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`update profiles set notification_prefs = '{"notice": {"email": false}}'::jsonb where id = ${userAId}`;
      expect(result.count).toBe(1);
    });
    const [after] = await adminSql`select notification_prefs from profiles where id = ${userAId}`;
    expect(after.notification_prefs).toEqual({ notice: { email: false } });
  });
});

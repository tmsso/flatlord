import { randomUUID, createHash } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. See project memory.
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

const createdUserIds: string[] = [];

afterEach(async () => {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop() as string;
    await sql`delete from profiles where id = ${id}`;
    await sql`delete from auth.users where id = ${id}`;
  }
  await sql`delete from invites where email like '%invite-trigger-test%'`;
  await sql`delete from persons where given_name = 'Invite' and family_name = 'Trigger Test'`;
  await sql`delete from persons where given_name like 'owner-no-person-%' and family_name = ''`;
});

afterAll(async () => {
  await sql.end();
});

async function insertAuthUser(email: string) {
  const id = randomUUID();
  createdUserIds.push(id);
  await sql`insert into auth.users (id, email) values (${id}, ${email})`;
  return id;
}

describe("handle_new_user invite matching", () => {
  it("creates a profile when a live invite matches the email", async () => {
    const [person] = await sql`
      insert into persons (given_name, family_name) values ('Invite', 'Trigger Test') returning id
    `;
    const email = `matched-${randomUUID()}@invite-trigger-test.example`;
    await sql`
      insert into invites (email, token_hash, role, person_id, expires_at)
      values (${email}, ${createHash("sha256").update("x").digest("hex")}, 'tenant', ${person.id}, now() + interval '7 days')
    `;

    const userId = await insertAuthUser(email);

    const [profile] = await sql`select role, person_id from profiles where id = ${userId}`;
    expect(profile).toBeDefined();
    expect(profile.role).toBe("tenant");
    expect(profile.person_id).toBe(person.id);

    const [invite] = await sql`select consumed_at from invites where email = ${email}`;
    expect(invite.consumed_at).not.toBeNull();
  });

  it("an owner invite without a person gets a bare person record (0034)", async () => {
    const local = `owner-no-person-${randomUUID()}`;
    const email = `${local}@invite-trigger-test.example`;
    await sql`
      insert into invites (email, token_hash, role, expires_at)
      values (${email}, ${createHash("sha256").update("x").digest("hex")}, 'owner', now() + interval '7 days')
    `;
    const userId = await insertAuthUser(email);

    const [profile] = await sql`select role, person_id from profiles where id = ${userId}`;
    expect(profile.role).toBe("owner");
    expect(profile.person_id).not.toBeNull();
    const [person] = await sql`select given_name, family_name, managed_by_person_id from persons where id = ${profile.person_id}`;
    expect(person).toEqual({ given_name: local, family_name: "", managed_by_person_id: null });
  });

  it("a tenant invite without a person still gets no person record", async () => {
    const email = `tenant-no-person-${randomUUID()}@invite-trigger-test.example`;
    await sql`
      insert into invites (email, token_hash, role, expires_at)
      values (${email}, ${createHash("sha256").update("x").digest("hex")}, 'tenant', now() + interval '7 days')
    `;
    const userId = await insertAuthUser(email);
    const [profile] = await sql`select person_id from profiles where id = ${userId}`;
    expect(profile.person_id).toBeNull();
  });

  it("does not create a profile when no invite matches", async () => {
    const email = `unmatched-${randomUUID()}@invite-trigger-test.example`;
    const userId = await insertAuthUser(email);

    const profiles = await sql`select id from profiles where id = ${userId}`;
    expect(profiles).toHaveLength(0);
  });

  it("does not match a revoked invite", async () => {
    const [person] = await sql`
      insert into persons (given_name, family_name) values ('Invite', 'Trigger Test') returning id
    `;
    const email = `revoked-${randomUUID()}@invite-trigger-test.example`;
    await sql`
      insert into invites (email, token_hash, role, person_id, expires_at, revoked_at)
      values (${email}, ${createHash("sha256").update("x").digest("hex")}, 'tenant', ${person.id}, now() + interval '7 days', now())
    `;

    const userId = await insertAuthUser(email);

    const profiles = await sql`select id from profiles where id = ${userId}`;
    expect(profiles).toHaveLength(0);
  });

  it("does not match an expired invite", async () => {
    const [person] = await sql`
      insert into persons (given_name, family_name) values ('Invite', 'Trigger Test') returning id
    `;
    const email = `expired-${randomUUID()}@invite-trigger-test.example`;
    await sql`
      insert into invites (email, token_hash, role, person_id, expires_at)
      values (${email}, ${createHash("sha256").update("x").digest("hex")}, 'tenant', ${person.id}, now() - interval '1 day')
    `;

    const userId = await insertAuthUser(email);

    const profiles = await sql`select id from profiles where id = ${userId}`;
    expect(profiles).toHaveLength(0);
  });
});

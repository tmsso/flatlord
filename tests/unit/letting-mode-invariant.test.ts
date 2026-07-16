import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. See project memory.
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

afterAll(async () => {
  await sql`delete from properties where name like 'LMI Test%'`;
  await sql.end();
});

async function makeHouse(tx: postgres.TransactionSql) {
  const id = randomUUID();
  await tx`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${id}, ${id}, null, 'house', 'LMI Test House', true)
  `;
  return id;
}

describe("letting-mode invariant", () => {
  it("rejects a room becoming active while its parent flat is in whole mode", async () => {
    await expect(
      sql.begin(async (tx) => {
        const houseId = await makeHouse(tx);
        const [flat] = await tx`
          insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
          values (${houseId}, ${houseId}, 'flat', 'LMI Test Flat', 'whole', true)
          returning id
        `;
        const [room] = await tx`
          insert into properties (root_property_id, parent_id, type, name, active)
          values (${houseId}, ${flat.id}, 'room', 'LMI Test Room', false)
          returning id
        `;
        // Deferred trigger — this succeeds within the transaction and only
        // raises at COMMIT, so the test asserts on the outer transaction promise.
        await tx`update properties set active = true where id = ${room.id}`;
      }),
    ).rejects.toThrow(/whole/i);
  });

  it("rejects a flat switching to whole mode while a child room is active", async () => {
    const setup = await sql.begin(async (tx) => {
      const houseId = await makeHouse(tx);
      const [flat] = await tx`
        insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
        values (${houseId}, ${houseId}, 'flat', 'LMI Test Flat', 'by_room', false)
        returning id
      `;
      await tx`
        insert into properties (root_property_id, parent_id, type, name, active)
        values (${houseId}, ${flat.id}, 'room', 'LMI Test Room', true)
      `;
      return { flatId: flat.id as string };
    });

    await expect(
      sql`update properties set letting_mode = 'whole' where id = ${setup.flatId}`,
    ).rejects.toThrow(/still active/i);
  });

  it("allows by_room mode with an active room, and property_is_lettable agrees", async () => {
    const result = await sql.begin(async (tx) => {
      const houseId = await makeHouse(tx);
      const [flat] = await tx`
        insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
        values (${houseId}, ${houseId}, 'flat', 'LMI Test Flat', 'by_room', false)
        returning id
      `;
      const [room] = await tx`
        insert into properties (root_property_id, parent_id, type, name, active)
        values (${houseId}, ${flat.id}, 'room', 'LMI Test Room', true)
        returning id
      `;
      return { flatId: flat.id as string, roomId: room.id as string };
    });

    const [{ lettable: roomLettable }] = await sql`
      select property_is_lettable(${result.roomId}) as lettable
    `;
    const [{ lettable: flatLettable }] = await sql`
      select property_is_lettable(${result.flatId}) as lettable
    `;
    expect(roomLettable).toBe(true);
    expect(flatLettable).toBe(false);
  });

  it("rejects a room with no parent_id immediately (not deferred)", async () => {
    const id = randomUUID();
    await expect(
      sql`
        insert into properties (id, root_property_id, parent_id, type, name, active)
        values (${id}, ${id}, null, 'room', 'LMI Test Orphan Room', true)
      `,
    ).rejects.toThrow(/parent flat/i);
  });

  it("rejects a tenancy targeting a house directly", async () => {
    const houseId = await sql.begin((tx) => makeHouse(tx));
    const [person] = await sql`
      insert into persons (given_name, family_name) values ('LMI Test', 'Person') returning id
    `;
    await expect(
      sql`
        insert into tenancies (unit_id, primary_tenant_id, term_start, status)
        values (${houseId}, ${person.id}, '2026-01-01', 'active')
      `,
    ).rejects.toThrow(/house/i);
    await sql`delete from persons where id = ${person.id}`;
  });
});

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBackupArchive } from "../../src/lib/backup/build-backup-archive";

// The in-app export reads through the database-owner connection, which
// bypasses RLS; until 2026-10-12 it therefore handed every owner every
// other owner's data. It now drops to the caller's role inside one
// transaction — this pins that: owner B's export must not contain owner A's
// tenant, and A's must. CI-only (needs SUPABASE_DB_URL), like the rls-*
// tests.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let ownerAUserId: string;
let ownerBUserId: string;
const personIds: string[] = [];
let houseId: string;
let tenancyId: string;

function readTable(zip: Buffer, table: string): Record<string, unknown>[] {
  const dir = mkdtempSync(join(tmpdir(), "flatlord-export-"));
  const file = join(dir, "export.zip");
  writeFileSync(file, zip);
  return JSON.parse(execFileSync("unzip", ["-p", file, `tables/${table}.json`]).toString());
}

beforeAll(async () => {
  const owner = async (name: string) => {
    const [p] = await adminSql`insert into persons (given_name, family_name) values ('BES Test', ${name}) returning id`;
    personIds.push(p.id);
    const userId = randomUUID();
    await adminSql`insert into auth.users (id) values (${userId})`;
    await adminSql`insert into profiles (id, person_id, role, locale) values (${userId}, ${p.id}, 'owner', 'hu')`;
    return { userId, personId: p.id as string };
  };
  const a = await owner("Owner A");
  const b = await owner("Owner B");
  ownerAUserId = a.userId;
  ownerBUserId = b.userId;

  houseId = randomUUID();
  await adminSql`insert into properties (id, root_property_id, parent_id, type, name, active) values (${houseId}, ${houseId}, null, 'house', 'BES Test House', true)`;
  const [flat] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'BES Test Flat', 'whole', true) returning id
  `;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${a.personId}, 100)`;
  const [tenant] = await adminSql`insert into persons (given_name, family_name, managed_by_person_id) values ('BES Test', 'Tenant A', ${a.personId}) returning id`;
  personIds.push(tenant.id);
  const [tenancy] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status) values (${flat.id}, ${tenant.id}, '2026-01-01', 'active') returning id
  `;
  tenancyId = tenancy.id;
});

afterAll(async () => {
  await adminSql`delete from tenancies where id = ${tenancyId}`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from properties where root_property_id = ${houseId} and parent_id is not null`;
  await adminSql`delete from properties where id = ${houseId}`;
  await adminSql`delete from profiles where id = any(${[ownerAUserId, ownerBUserId]}::uuid[])`;
  await adminSql`delete from auth.users where id = any(${[ownerAUserId, ownerBUserId]}::uuid[])`;
  await adminSql`update persons set managed_by_person_id = null where id = any(${personIds}::uuid[])`;
  await adminSql`delete from persons where id = any(${personIds}::uuid[])`;
  await adminSql.end();
});

describe("in-app backup export is scoped to the caller", () => {
  it("owner A's export includes A's tenancy and tenant; owner B's includes neither", async () => {
    const zipA = await buildBackupArchive({ dataOnly: true, userId: ownerAUserId });
    const zipB = await buildBackupArchive({ dataOnly: true, userId: ownerBUserId });

    const tenantId = personIds[2];
    expect(readTable(zipA, "tenancies").map((r) => r.id)).toContain(tenancyId);
    expect(readTable(zipA, "persons").map((r) => r.id)).toContain(tenantId);

    expect(readTable(zipB, "tenancies").map((r) => r.id)).not.toContain(tenancyId);
    const bPersons = readTable(zipB, "persons").map((r) => r.id);
    expect(bPersons).not.toContain(tenantId);
    expect(bPersons).not.toContain(personIds[0]);
  });
});

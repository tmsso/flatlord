// Synthetic demo data only — mirrors CLAUDE.md's example names. Never
// import anything from /private. Seeds business data (persons, properties,
// tenancies); auth accounts are created separately via the real invite/
// login flow (Phase 0 M5), not seeded here.
import { randomUUID } from "node:crypto";
import { db } from "../src/db/client";
import { persons, properties, propertyOwnership, tenancies } from "../src/db/schema";

async function main() {
  const [owner] = await db
    .insert(persons)
    .values({ givenName: "Emma", familyName: "Admin" })
    .returning();

  const [tenantWhole] = await db
    .insert(persons)
    .values({ givenName: "Alex", familyName: "Tenant" })
    .returning();

  const [tenantByRoom] = await db
    .insert(persons)
    .values({ givenName: "Kata", familyName: "Tenant" })
    .returning();

  const houseId = randomUUID();
  await db.insert(properties).values({
    id: houseId,
    rootPropertyId: houseId,
    parentId: null,
    type: "house",
    name: "Kertész utca 12.",
    hrsz: "34567/0",
    active: true,
  });

  // Flat 1: let out as a whole.
  const [flatWhole] = await db
    .insert(properties)
    .values({
      rootPropertyId: houseId,
      parentId: houseId,
      type: "flat",
      name: "Kertész utca 12. 1/3",
      addressLine: "Kertész utca 12. 1/3, 1073 Budapest",
      hrsz: "34567/0/A/1",
      lettingMode: "whole",
      active: true,
    })
    .returning();

  // Flat 2: let out room by room — flat itself is not directly lettable.
  const [flatByRoom] = await db
    .insert(properties)
    .values({
      rootPropertyId: houseId,
      parentId: houseId,
      type: "flat",
      name: "Kertész utca 12. 3/12",
      addressLine: "Kertész utca 12. 3/12, 1073 Budapest",
      hrsz: "34567/0/A/12",
      lettingMode: "by_room",
      active: false,
    })
    .returning();

  const [room1] = await db
    .insert(properties)
    .values({
      rootPropertyId: houseId,
      parentId: flatByRoom.id,
      type: "room",
      name: "Szoba 1",
      active: true,
    })
    .returning();

  await db.insert(properties).values({
    rootPropertyId: houseId,
    parentId: flatByRoom.id,
    type: "room",
    name: "Szoba 2",
    active: false,
  });

  await db.insert(propertyOwnership).values({
    propertyId: houseId,
    personId: owner.id,
    percentage: "100",
  });

  await db.insert(tenancies).values({
    unitId: flatWhole.id,
    primaryTenantId: tenantWhole.id,
    termStart: "2026-01-01",
    noticeDays: 30,
    dueDay: 5,
    status: "active",
  });

  await db.insert(tenancies).values({
    unitId: room1.id,
    primaryTenantId: tenantByRoom.id,
    termStart: "2026-03-01",
    noticeDays: 30,
    dueDay: 5,
    status: "active",
  });

  console.log("Seeded:", {
    owner: owner.id,
    house: houseId,
    flatWhole: flatWhole.id,
    flatByRoom: flatByRoom.id,
    room1: room1.id,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

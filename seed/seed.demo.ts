// Synthetic demo data only — mirrors CLAUDE.md's example names. Never
// import anything from /private. Seeds business data (persons, properties,
// tenancies); auth accounts are created separately via the real invite/
// login flow (Phase 0 M5), not seeded here.
import { randomUUID } from "node:crypto";
import { db } from "../src/db/client";
import {
  persons,
  properties,
  propertyOwnership,
  tenancies,
  chargeTypes,
  chargeSchedules,
  meters,
  fieldRequirements,
} from "../src/db/schema";

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

  const [tenancyWhole] = await db
    .insert(tenancies)
    .values({
      unitId: flatWhole.id,
      primaryTenantId: tenantWhole.id,
      termStart: "2026-01-01",
      noticeDays: 30,
      dueDay: 5,
      status: "active",
    })
    .returning();

  const [tenancyByRoom] = await db
    .insert(tenancies)
    .values({
      unitId: room1.id,
      primaryTenantId: tenantByRoom.id,
      termStart: "2026-03-01",
      noticeDays: 30,
      dueDay: 5,
      status: "active",
    })
    .returning();

  // Charge catalog + schedules for the whole-flat tenancy: rent + common
  // cost (fixed), electricity + water (metered, water shared across two
  // meters under one tariff).
  const [rentWhole, commonCostWhole, electricityWhole, waterWhole] = await db
    .insert(chargeTypes)
    .values([
      { unitId: flatWhole.id, kind: "fixed", code: "rent", name: "Rent", sortOrder: 0 },
      {
        unitId: flatWhole.id,
        kind: "fixed",
        code: "common_cost",
        name: "Common cost",
        sortOrder: 1,
      },
      {
        unitId: flatWhole.id,
        kind: "metered",
        code: "electricity",
        name: "Electricity",
        unit: "kWh",
        sortOrder: 2,
      },
      {
        unitId: flatWhole.id,
        kind: "metered",
        code: "water",
        name: "Water",
        unit: "m3",
        sortOrder: 3,
      },
    ])
    .returning();

  await db.insert(chargeSchedules).values([
    { tenancyId: tenancyWhole.id, chargeTypeId: rentWhole.id, amount: 250000, validFrom: "2026-01-01" },
    {
      tenancyId: tenancyWhole.id,
      chargeTypeId: commonCostWhole.id,
      amount: 25000,
      validFrom: "2026-01-01",
    },
    {
      tenancyId: tenancyWhole.id,
      chargeTypeId: electricityWhole.id,
      ratePerUnit: "70",
      validFrom: "2026-01-01",
    },
    {
      tenancyId: tenancyWhole.id,
      chargeTypeId: waterWhole.id,
      ratePerUnit: "900",
      validFrom: "2026-01-01",
    },
  ]);

  await db.insert(meters).values([
    {
      unitId: flatWhole.id,
      chargeTypeId: electricityWhole.id,
      label: "Electricity",
      baseValue: "1000",
      installedAt: "2026-01-01",
    },
    {
      unitId: flatWhole.id,
      chargeTypeId: waterWhole.id,
      label: "Water — kitchen",
      baseValue: "50",
      installedAt: "2026-01-01",
    },
    {
      unitId: flatWhole.id,
      chargeTypeId: waterWhole.id,
      label: "Water — bathroom",
      baseValue: "30",
      installedAt: "2026-01-01",
    },
  ]);

  // Charge catalog + schedules for the by-room tenancy: same shape, one
  // water meter (a room typically has less plumbing than a whole flat).
  const [rentRoom, electricityRoom, waterRoom] = await db
    .insert(chargeTypes)
    .values([
      { unitId: room1.id, kind: "fixed", code: "rent", name: "Rent", sortOrder: 0 },
      {
        unitId: room1.id,
        kind: "metered",
        code: "electricity",
        name: "Electricity",
        unit: "kWh",
        sortOrder: 1,
      },
      { unitId: room1.id, kind: "metered", code: "water", name: "Water", unit: "m3", sortOrder: 2 },
    ])
    .returning();

  await db.insert(chargeSchedules).values([
    { tenancyId: tenancyByRoom.id, chargeTypeId: rentRoom.id, amount: 120000, validFrom: "2026-03-01" },
    {
      tenancyId: tenancyByRoom.id,
      chargeTypeId: electricityRoom.id,
      ratePerUnit: "70",
      validFrom: "2026-03-01",
    },
    {
      tenancyId: tenancyByRoom.id,
      chargeTypeId: waterRoom.id,
      ratePerUnit: "900",
      validFrom: "2026-03-01",
    },
  ]);

  await db.insert(meters).values([
    {
      unitId: room1.id,
      chargeTypeId: electricityRoom.id,
      label: "Electricity",
      baseValue: "200",
      installedAt: "2026-03-01",
    },
    {
      unitId: room1.id,
      chargeTypeId: waterRoom.id,
      label: "Water",
      baseValue: "10",
      installedAt: "2026-03-01",
    },
  ]);

  // Field-requirement engine rule rows (ROADMAP Phase 1 example set).
  await db.insert(fieldRequirements).values([
    {
      fieldName: "document_type",
      registrationType: "main_address",
      required: true,
      note: "Required for permanent-residence registration.",
    },
    {
      fieldName: "document_number",
      registrationType: "main_address",
      required: true,
      note: "Required for permanent-residence registration.",
    },
    {
      fieldName: "dob",
      registrationType: "main_address",
      required: true,
      note: "Required for permanent-residence registration.",
    },
    {
      fieldName: "document_number",
      registrationType: "temporary",
      required: true,
      note: "Required for temporary registration.",
    },
    {
      fieldName: "document_number",
      registrationType: "casual",
      required: false,
      note: "Casual occupants only need a name on file.",
    },
    {
      fieldName: "document_number",
      registrationType: "owner_agent",
      required: false,
      note: "Owner/agent occupants only need a name on file.",
    },
    {
      fieldName: "dob",
      registrationType: "owner_agent",
      required: false,
      note: "Owner/agent occupants only need a name on file.",
    },
  ]);

  console.log("Seeded:", {
    owner: owner.id,
    house: houseId,
    flatWhole: flatWhole.id,
    flatByRoom: flatByRoom.id,
    room1: room1.id,
    tenancyWhole: tenancyWhole.id,
    tenancyByRoom: tenancyByRoom.id,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

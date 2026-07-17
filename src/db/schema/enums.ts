import { pgEnum } from "drizzle-orm/pg-core";

export const propertyTypeEnum = pgEnum("property_type", [
  "house",
  "flat",
  "room",
]);

// Only meaningful on a flat with child rooms — see properties.ts for the
// mutual-exclusivity invariant this drives.
export const lettingModeEnum = pgEnum("letting_mode", ["whole", "by_room"]);

export const tenancyStatusEnum = pgEnum("tenancy_status", [
  "draft",
  "active",
  "ended",
  "terminated",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "id_card",
  "passport",
  "residence_permit",
]);

export const profileRoleEnum = pgEnum("profile_role", ["owner", "tenant"]);

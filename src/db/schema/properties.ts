import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  check,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propertyTypeEnum, lettingModeEnum } from "./enums";

/**
 * Self-referential house/flat/room tree (design/11 Property Metadata).
 *
 * Letting-mode invariant (explicit product rule, overrides the design
 * mockup's own "let as a whole (rooms can also be let individually)" copy —
 * that combination is NOT allowed here): a flat with child rooms is in
 * exactly one of two states — `whole` (the flat itself is the lettable
 * unit; every child room must be inactive) or `by_room` (the flat is not
 * directly lettable; each room is independently active/inactive). A flat
 * with no rooms is trivially its own lettable unit regardless of
 * `letting_mode`.
 *
 * `active` is a general in-service/vacancy flag, independent of which node
 * is currently the lettable one — see the deferred trigger in the M3
 * migration for how "currently lettable" is derived and enforced.
 */
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Top ancestor of the tree; equals `id` on root rows (house or a
    // top-level flat with no house parent).
    rootPropertyId: uuid("root_property_id")
      .notNull()
      .references((): AnyPgColumn => properties.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => properties.id),
    type: propertyTypeEnum("type").notNull(),
    name: text("name").notNull(),
    // House/flat only — rooms inherit their parent flat's address (design's
    // own stated rule), never stored redundantly on the room row.
    addressLine: text("address_line"),
    // helyrajzi szám (Hungarian cadastral/local ID) — house/flat only.
    hrsz: text("hrsz"),
    lettingMode: lettingModeEnum("letting_mode"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("properties_parent_id_idx").on(table.parentId),
    index("properties_root_property_id_idx").on(table.rootPropertyId),
    check(
      "letting_mode_only_on_flat",
      sql`(${table.type} = 'flat') = (${table.lettingMode} is not null)`,
    ),
    check(
      "hrsz_only_on_house_or_flat",
      sql`${table.type} <> 'room' or ${table.hrsz} is null`,
    ),
    check(
      "address_only_on_house_or_flat",
      sql`${table.type} <> 'room' or ${table.addressLine} is null`,
    ),
  ],
);

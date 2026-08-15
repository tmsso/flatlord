import {
  pgTable,
  uuid,
  smallint,
  bigint,
  char,
  date,
  text,
  customType,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { contractStatusEnum } from "./enums";

// Postgres tsvector has no first-class drizzle-orm column type — defined
// as a custom type purely so drizzle-kit knows the column exists (schema
// diffing); the GENERATED ALWAYS AS ... STORED expression itself is
// appended by hand in the migration, same idiom as the property_id
// denorm columns elsewhere (default here is a placeholder drizzle-kit
// needs, the real value is always computed, never app-set).
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Version chain per tenancy (ROADMAP Phase 2): each row is one signed
// contract version, predecessor_contract_id links back to the version it
// replaces. Structured key terms (term dates, notice days, deposit) live
// here as the source of truth for that version; activating a version
// (server action, not a trigger — see src/server/contracts/activate-
// contract.ts) copies them onto the parent tenancy row and flips the
// previous active version to 'superseded'. document_text is best-effort
// digital-PDF text-layer extraction only (unpdf) — OCR-for-scans is Phase
// 2's *next* item (contract intake parsing, needs OpenRouter), so this
// column is frequently null for scanned uploads and that's expected, not
// a bug.
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    // Denormalized from tenancies.property_id, trigger-set — same pattern
    // as statements.property_id (migration 0008).
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    version: smallint("version").notNull(),
    predecessorContractId: uuid("predecessor_contract_id").references((): AnyPgColumn => contracts.id),
    status: contractStatusEnum("status").notNull().default("draft"),
    // Storage path in the `contracts` bucket, `{tenancyId}/{id}.pdf`.
    documentPath: text("document_path"),
    documentText: text("document_text"),
    searchVector: tsvector("search_vector"),
    termStart: date("term_start"),
    termEnd: date("term_end"),
    noticeDays: smallint("notice_days"),
    depositAmount: bigint("deposit_amount", { mode: "number" }),
    depositCurrency: char("deposit_currency", { length: 3 }).notNull().default("HUF"),
    signedAt: date("signed_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("contracts_tenancy_version_unique").on(table.tenancyId, table.version)],
);

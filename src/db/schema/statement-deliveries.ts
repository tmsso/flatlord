import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { statements } from "./statements";
import { persons } from "./persons";

// Delivery log for a statement (design/05 "Delivery" panel): every
// tenant-addressed amount-due send, manual or automatic. Append-only —
// a sent message can't be unsent, so there are no UPDATE/DELETE policies
// (migration 0028). Text + CHECK rather than enums (D-11) so new channels
// or kinds don't need an enum migration.
//
// WhatsApp goes out through a wa.me link the admin opens on their own
// device — the app can't know whether it was actually sent, so it's
// logged honestly as 'prepared', never 'sent'.
export const statementDeliveries = pgTable(
  "statement_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => statements.id),
    // Denormalized from statements, trigger-set (same as payments).
    tenancyId: uuid("tenancy_id").notNull().default(sql`gen_random_uuid()`),
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    channel: text("channel").notNull(), // 'email' | 'whatsapp'
    kind: text("kind").notNull(), // 'amount_due' (manual) | 'payment_reminder' (cron)
    status: text("status").notNull(), // 'sent' | 'failed' | 'prepared'
    // Resend message id for a sent email; null otherwise.
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    // Person who triggered it; null for the cron.
    createdBy: uuid("created_by").references(() => persons.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("statement_deliveries_statement_id_idx").on(table.statementId),
    index("statement_deliveries_created_by_idx").on(table.createdBy),
    check("statement_deliveries_channel_check", sql`${table.channel} in ('email', 'whatsapp')`),
    check("statement_deliveries_kind_check", sql`${table.kind} in ('amount_due', 'payment_reminder')`),
    check("statement_deliveries_status_check", sql`${table.status} in ('sent', 'failed', 'prepared')`),
  ],
);

CREATE INDEX "profiles_person_id_idx" ON "profiles" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "property_ownership_person_id_idx" ON "property_ownership" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "tenancies_unit_id_idx" ON "tenancies" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "tenancies_primary_tenant_id_idx" ON "tenancies" USING btree ("primary_tenant_id");--> statement-breakpoint
CREATE INDEX "tenancy_occupants_tenancy_id_idx" ON "tenancy_occupants" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "tenancy_occupants_person_id_idx" ON "tenancy_occupants" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "invites_person_id_idx" ON "invites" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "invites_invited_by_idx" ON "invites" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "charge_types_unit_id_idx" ON "charge_types" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "charge_schedules_tenancy_id_idx" ON "charge_schedules" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "charge_schedules_charge_type_id_idx" ON "charge_schedules" USING btree ("charge_type_id");--> statement-breakpoint
CREATE INDEX "adjustments_tenancy_id_idx" ON "adjustments" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "adjustments_charge_type_id_idx" ON "adjustments" USING btree ("charge_type_id");--> statement-breakpoint
CREATE INDEX "adjustments_created_by_idx" ON "adjustments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "meters_unit_id_idx" ON "meters" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "meters_charge_type_id_idx" ON "meters" USING btree ("charge_type_id");--> statement-breakpoint
CREATE INDEX "meters_replaces_meter_id_idx" ON "meters" USING btree ("replaces_meter_id");--> statement-breakpoint
CREATE INDEX "meter_readings_meter_id_idx" ON "meter_readings" USING btree ("meter_id");--> statement-breakpoint
CREATE INDEX "meter_readings_tenancy_id_idx" ON "meter_readings" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "meter_readings_entered_by_idx" ON "meter_readings" USING btree ("entered_by");--> statement-breakpoint
CREATE INDEX "meter_readings_confirmed_by_idx" ON "meter_readings" USING btree ("confirmed_by");--> statement-breakpoint
CREATE INDEX "statement_line_items_statement_id_idx" ON "statement_line_items" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "statement_line_items_charge_type_id_idx" ON "statement_line_items" USING btree ("charge_type_id");--> statement-breakpoint
CREATE INDEX "statement_line_items_charge_schedule_id_idx" ON "statement_line_items" USING btree ("charge_schedule_id");--> statement-breakpoint
CREATE INDEX "statement_line_items_meter_id_idx" ON "statement_line_items" USING btree ("meter_id");--> statement-breakpoint
CREATE INDEX "statement_line_items_from_reading_id_idx" ON "statement_line_items" USING btree ("from_reading_id");--> statement-breakpoint
CREATE INDEX "statement_line_items_to_reading_id_idx" ON "statement_line_items" USING btree ("to_reading_id");--> statement-breakpoint
CREATE INDEX "statement_line_items_adjustment_id_idx" ON "statement_line_items" USING btree ("adjustment_id");--> statement-breakpoint
CREATE INDEX "payments_statement_id_idx" ON "payments" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "payments_recorded_by_idx" ON "payments" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "contracts_predecessor_contract_id_idx" ON "contracts" USING btree ("predecessor_contract_id");--> statement-breakpoint
CREATE INDEX "deposit_transactions_tenancy_id_idx" ON "deposit_transactions" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "deposit_transactions_applied_to_statement_id_idx" ON "deposit_transactions" USING btree ("applied_to_statement_id");--> statement-breakpoint
CREATE INDEX "deposit_transactions_recorded_by_idx" ON "deposit_transactions" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "attachments_uploaded_by_idx" ON "attachments" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "inventory_items_unit_id_idx" ON "inventory_items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "inventory_reconfirmation_items_inventory_item_id_idx" ON "inventory_reconfirmation_items" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_reconfirmations_tenancy_id_idx" ON "inventory_reconfirmations" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "inventory_reconfirmations_initiated_by_idx" ON "inventory_reconfirmations" USING btree ("initiated_by");--> statement-breakpoint
CREATE INDEX "request_messages_request_id_idx" ON "request_messages" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_messages_author_id_idx" ON "request_messages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "requests_tenancy_id_idx" ON "requests" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "requests_initiated_by_idx" ON "requests" USING btree ("initiated_by");--> statement-breakpoint
CREATE INDEX "notices_tenancy_id_idx" ON "notices" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "notices_acknowledged_by_idx" ON "notices" USING btree ("acknowledged_by");--> statement-breakpoint
CREATE INDEX "notices_issued_by_idx" ON "notices" USING btree ("issued_by");--> statement-breakpoint

-- notifications isn't in the drizzle schema (created via raw SQL in
-- migration 0022 — see attachments.ts's comment on the same pattern), so
-- drizzle-kit generate can't see it; these two indexes are hand-written
-- for the same reason B-10 wants every FK/RLS-subquery column indexed.
CREATE INDEX "notifications_recipient_profile_id_idx" ON "notifications" USING btree ("recipient_profile_id");
--> statement-breakpoint

CREATE INDEX "notifications_entity_type_entity_id_idx" ON "notifications" USING btree ("entity_type", "entity_id");

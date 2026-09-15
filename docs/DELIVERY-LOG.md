# Delivery log — what shipped, when, with what scope cuts

Append-only history moved out of `ROADMAP.md` on 2026-09-15 so the roadmap stays a plan. Newest phase last; within a phase, items in ship order. Verification status is stated as it was actually established, not as hoped.

## Phase 0 — Foundation (July 2026)

- Next.js App Router + TS strict, Tailwind 4, shadcn v4 (base-nova / Base UI), next-intl hu+en, dark mode, admin + tenant shells; design tokens from `design/README.md` ported into `globals.css`.
- ORM decision: Drizzle for schema + migrations, supabase-js for app access (D-01).
- Supabase Auth: Google OAuth + magic link, invite-only (`invites` table, `handle_new_user` trigger matching a live invite — migration `0004`), revoke. Coarse owner/tenant role; the per-property permission matrix (`design/13`) deferred to Phase 5.
- Core schema: `profiles`, `properties` (tree: house/flat/room with letting-mode invariants — `0001`, `0003`), `persons`, `tenancies` (due day, `reminder_lead_days` jsonb), `tenancy_occupants`, `field_policies`, `audit_log`. RLS from day one; explicit GRANTs to `authenticated` (`0006`) — a recurring gotcha.
- CI: lint, typecheck, `supabase db start` (real Supabase Postgres), demo seed, `next build`, Vitest incl. RLS isolation tests.

## Phase 1 — Billing core, meter flow, backup (July–August 2026)

- Charge model: `charge_types` (fixed / metered / tracked-only / one-off, per-property on/off), `charge_schedules` (effective-dated), `adjustments`. Pure billing engine `src/lib/billing/compute-statement.ts` with unit tests.
- Meters & readings: `meters`, `meter_readings` (`entered/ocr/confirmed` columns), phone-first camera capture flow (`capture="environment"` + upload fallback, ≥previous validation), admin verification panel, private `meter-photos` bucket (`0010`).
- Statement lifecycle draft → issued (immutable snapshot, DB trigger) → partially_paid / paid; `payments` many-per-statement; overdue derived at display time.
- Google Sheet importer (`scripts/import-sheet.ts`) with golden tests: real fixture gitignored, synthetic twin in `fixtures/`. **Prod: 32 historical statements imported and golden-verified to the forint.**
- Amount-due delivery: bilingual Resend email + `wa.me` deep link. Resend key set; **account still in sandbox mode** (only the account's own address receives) — root blocker of the real acceptance run.
- Backup v1: in-app export (JSON + CSV per table + assets, "data only" toggle, streamed zip via `archiver`); nightly GitHub Action → GitHub Releases on the private `flatlord-backups` repo, 30-day retention; restore tested with exact row-count parity (`docs/backup-restore.md`).
- Admin CRUD: properties (tree UI), tenancies, persons with the **field-requirement engine** (mandatoriness by registration type, explained in-UI). Payment instructions per property (`0014`).
- Tenant portal v1: amount due + line items, statement history, meter history, key rental data, own/co-occupant details.
- Charts v1: per-meter consumption, monthly cost stacked bars (recharts).
- Ops: dev-project keep-alive Action, `migrate-prod.yml` (manual dispatch), production health check (every 6h), quarterly restore-drill reminder issue, `docs/self-host-escape-hatch.md`, Vercel deploy at `flatlord.vercel.app`.
- **Gate 1→2 suppressed 2026-08-07** by the admin; the real prod acceptance run (real tenant, real statement) remains open. Dev dry-run of the full cycle completed 2026-08-04.
- Fix: `assertNoQueryError()` on the `notFound()`-gating queries of six detail pages (PRs #6, #7); secondary queries still drop `error` (B-11).

## Phase 2 — Documents, contract, inventory (August 2026)

- Contract module (PR #14, `0015`): version chain per tenancy, PDF upload to private bucket, `tsvector` search column, structured key terms.
- Contract intake parsing (PR #15): digital-PDF text layer via `unpdf` + regex/heuristic proposal, admin accepts per field, nothing auto-committed. **Scanned OCR deferred to Phase 5** (D-16); "OCR not configured" fallback in the UI.
- Deposit ledger (PR #16, `0016`): transaction history, running balance, admin record UI, tenant read-only view. **Real backfill from `/private` deliberately not run** (admin action).
- Generic attachments (PR #17, `0017`): polymorphic table + private bucket, admin upload/soft-remove, tenant read; `entity_type` is `text` + `CHECK` (D-11).
- Document template generator (PR #18): one bilingual declaration PDF via `@react-pdf/renderer` with vendored IBM Plex fonts (`outputFileTracingIncludes` needed for Vercel); saved through attachments.
- Inventory (PR #19, `0018`; fix PR #20): items with conditional ownership + `action_by`, photo gallery, reconfirmation campaigns (full/subset, item-by-item confirm/flag with photo). **Move-in/out snapshots + handover protocol not built** (B-13). Discrepancy → status + owner email; real auto-open of a request wired in Phase 3.
- Verified end-to-end on dev with headless Playwright; not formally Accepted.

## Phase 3 — Requests, notices, editability, notifications (September 2026)

- Requests (`0019`): categories, attachments, threaded messages both ways, resolve/reject/withdraw, external case ref + appointment date, admin dashboard with filters; inventory discrepancies auto-open a request.
- Notices (PR #22, `0020`): types incl. formal warnings with clause + sequence, in-app + email, explicit acknowledgement, immutable once issued.
- Field-level editability (`0021`): 3-way policy admin UI for `person` fields; `free` edits apply + audit + notify; `approval_required` reuses `requests.change_payload`; `document_type` excluded (enum). Sensitive fields redacted in audit for everyone (D-09).
- Notification centre (`0022`): `notifications` table, bell in both shells, per-category email opt-out in `profiles.notification_prefs`; column-level GRANT does not restrict on Supabase — RLS `WITH CHECK` self-comparison used instead.
- Fix `0023` (PR #27): tenant-initiated `audit_log` inserts had silently failed since `0019` — caught only by a real authenticated click-through.
- **Gate 3→4 suppressed 2026-09-04** by the admin.

## Phase 4a — Automation core (September 2026)

- Daily Vercel Cron (`/api/cron/daily-reminders`, 07:00 UTC, `CRON_SECRET` bearer, fail-closed): payment-due reminders + overdue admin alerts (PR #26); meter-reading-window nudge, contract-expiry, rate-review, inventory `action_by` (PR #28); scheduled inventory reconfirmation, opt-in per tenancy (PR #32). Idempotent per day via the `notifications` table. No new tables.
- PDF statement export (PR #29): bilingual, one route for both roles.
- Statement auto-draft on month close (PR #31): drafts when every active meter has a verified in-period reading; "couldn't draft" alert otherwise; never auto-issues (D-20). Shipped with the retroactive-issue grace (D-03) and the dashboard "N drafts awaiting issue" callout.
- Docs: 4a/4b split and IDEAS triage (PR #30).
- **`CRON_SECRET` unset in Vercel** → every scheduled invocation returns 401; the Accept clause cannot be observed until the admin sets it.

## Phase 4b — Reporting & owner tools (in progress)

- PR #33 (merged 2026-09-16, rebased onto the 2026-09-15 doc restructure): per-tenancy cumulative "billed vs received" ledger chart + admin event timeline, admin shell only.

## Review pass 2026-09-15 (Fable)

- PR #34: Vercel `fra1` region, `Card` border/shadow/radius per design, nav icons + active state + logo tile, tenant shell mobile fixes (five tabs, icon-only bell/sign-out, viewport-pinned notification panel), lint warning.
- Docs restructure: this file, `BACKLOG.md`, `docs/DECISIONS.md`, `docs/NEXT-BATCH.md`, `docs/HEALTH-REPORT-2026-09-15.md`; `ROADMAP.md` reduced to open work; `IDEAS.md` pruned; `README.md` and `CLAUDE.md` docs map refreshed.

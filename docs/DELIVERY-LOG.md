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
- PR #36 (merged 2026-09-15): `BACKLOG.md` B-02/B-10/B-18 — parallelised the sequential Supabase queries on the six heaviest pages (`Promise.all` in ≤3 dependency stages), added btree indexes on every FK / `(entity_type, entity_id)` pair (migration `0024`, applied to prod 2026-09-17 via `migrate-prod.yml`), and `maxDuration = 60` on the backup + PDF routes.
- PR #39 (merged 2026-09-17): `BACKLOG.md` B-05/B-06/B-07 — draft statement discard (soft `voided_at`, partial unique index on `(tenancy_id, period_month)` so a voided draft frees the slot for regeneration — migration `0025`, applied to prod 2026-09-17 via `migrate-prod.yml`; fixed the auto-draft cron's existing-draft check to exclude voided rows, else the feature would have been silently defeated), due-date = tenancy `due_day` of the month after issue (D-05 option b), historical charge names resolved to the i18n catalog label at render time across all 3 web read paths + the PDF (D-07). Golden tests untouched, still green.

## Phase 4c — UI fidelity pass (in progress)

- PR #37 (merged 2026-09-17): item 1, component layer to design tokens — button/input/table/badge/section-header/page-header/month-picker/effective-dated-table/audit-drawer/attachment-chip restyled to `design/01`. Fixed a real pre-existing hydration-mismatch bug in `theme-toggle.tsx` found via dark-mode Playwright verification (`aria-label` read `resolvedTheme` with no mounted guard; fixed with a `useSyncExternalStore`-based guard, the only shape that passes this repo's `react-hooks/set-state-in-effect` lint rule). Introduced a second `MonthPicker` component (href-navigation) alongside the pre-existing controlled one — flagged as `BACKLOG.md` B-27, not reconciled in this PR.
- PR #38 (merged 2026-09-17): item 2, real admin dashboard (`design/04`) — overdue alert, property & term card, billing-cycle stepper, outstanding card, recent statements table, needs-attention queue, both charts, all from real parallelised queries (`src/lib/dashboard/get-dashboard-data.ts`). Verified on dev with real billing data, both themes, zero console errors.
- Both PRs are functionally verified on dev; **owner visual sign-off against the `design/01`/`design/04` mockups is still open** — that is the Accept gate for Phase 4c, not a formality met by shipping the code.
- Found and deliberately deferred (not fixed this session, filed to `BACKLOG.md`): B-26 (tenant statement queries + RLS don't exclude `status = 'draft'` — a tenant can see an unissued draft).

## Long batch 2026-10-08 — hardening + Phase 4c items 3–5

Owner answered "defaults, you can merge"; all PRs below merged and deployed (prod at `d5afad8`). **Migrations `0026`–`0028` are in the repo and on dev, not yet on prod** — see the admin checklist in `ROADMAP.md`.

- PR #41: owner's name removed from public-repo files (D-25).
- PR #42: **B-25** default-deny route classification (`src/lib/auth/route-access.ts` + fail-closed unit test). Confirmed pre-fix D-15 breach on dev (tenant saw the cumulative ledger on their own tenancy page).
- PR #43: **B-26** tenants never see drafts — query filters + `0026` (statements and line items RLS).
- PR #44: explicit `requireOwnerPersonId` in 7 owner-only server actions (RLS already held) + fail-closed guard test over every `"use server"` module.
- PR #45: **new finding** — `tenant_insert_meter_readings` let a tenant insert an already-`verified` reading via the REST API (reproduced on dev); `0027` pins status/source/confirmed/OCR columns and `entered_by`.
- PR #46: branded `error.tsx` / `not-found.tsx` (root + both route groups) and `global-error.tsx` (copy inlined in hu+en — the one catalog exception, renders without the i18n provider).
- PR #47: the "flaky" `rls-requests-isolation` afterAll was a real race (name-pattern delete hitting a sibling file's fixtures); fixed.
- PR #48: workflow actions moved to their first Node 24 majors (checkout/setup-node/pnpm-action v5, supabase setup-cli v2). `backup.yml`'s first run on them is the next nightly.
- PR #49: **4c item 3** admin statement detail = `design/05` + delivery log (`0028`, D-23, D-24).
- PR #50: next-intl `timeZone: Europe/Budapest` (D-22) — prod had shown UTC times; reproduced with a `TZ=UTC` dev server.
- PR #51: **4c item 4a** tenant home = `design/02` (real reading window from `meter_reading_config`, reconciling breakdown, notices strip, mini-chart).
- PR #52: **4c item 4b** tenant meter flow = `design/03` + "note to owner" escape (D-26); caught and fixed an `Intl` date-range hydration mismatch.
- PR #53: **4c item 5** readings verification = `design/06`; fixed the always-empty "confirmed value" box (ref override broke react-hook-form's prefill).
- PR #54: **B-19** admin phone drawer; `min-w-0` fixed horizontal overflow on 6 of 9 admin pages at 390px; translated filter labels.
- PR #56: "Ask for retake" was a dead end — the tenant page counted a rejected reading as done, so the month could never reach all-verified (pre-existing; #52 made it bite harder). Rejected now reopens the meter with a "Retake requested" pill; full loop verified on dev.
- Final smoke on merged `main` against dev: 38 page loads (owner 12 routes @1440, tenant 7 @390, × hu/en) — all 200, no overflow, zero console errors.
- **Not verified:** the tenant mini-chart (no metered data on dev, B-30); `global-error.tsx` at runtime; a real "sent" email row (no real sends — only the `failed` path via an invalid-key override).

## Review pass 2026-09-15 (Fable)

- PR #34: Vercel `fra1` region, `Card` border/shadow/radius per design, nav icons + active state + logo tile, tenant shell mobile fixes (five tabs, icon-only bell/sign-out, viewport-pinned notification panel), lint warning.
- Docs restructure: this file, `BACKLOG.md`, `docs/DECISIONS.md`, `docs/NEXT-BATCH.md`, `docs/HEALTH-REPORT-2026-09-15.md`; `ROADMAP.md` reduced to open work; `IDEAS.md` pruned; `README.md` and `CLAUDE.md` docs map refreshed.

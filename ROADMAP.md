# ROADMAP.md — Flatlord build plan

Companion to `CLAUDE.md` (domain rules — read first; note the privacy rule §0), `IDEAS.md` (loose backlog) and `design/` (UI handoff — design tokens, component sheet, 13 hi-fi/wireframe screens; see `design/README.md` for fidelity notes and the "Functional features added during design" list folded into the phases below). Phases are sequential; each ends with a demoable milestone. Suggested cadence: one phase per Claude Code batch, plan-mode review of schema/API before implementing.

## Phase 0 — Foundation

- Repo scaffold: Next.js App Router + TypeScript strict, Tailwind, shadcn/ui, next-intl (hu/en), dark mode, base layouts (admin shell + tenant shell), design tokens per CLAUDE.md §5 and `design/README.md` (IBM Plex Sans/Mono, oklch palette, radii/spacing/shadow scale — port into `globals.css` `:root`/`.dark`).
- Decide ORM approach (Drizzle vs supabase-js + generated types) — one-pager, then commit to it.
- Supabase project: Auth — **Google OAuth + emailed magic link only, no self-signup, invite-only accounts** (design-time change from the original "magic link + password" plan; see `design/08 Logon.dc.html`) — initial migrations, RLS scaffolding, Storage buckets (`contracts`, `attachments`, `meter-photos`, `inventory`).
- Core schema (effective-dated, multi-property-ready):
  - `users`, `profiles` (role type: owner/tenant, locale)
  - **Access model, simplified for now** (design-time addition — `design/13 Access Management.dc.html`): invite via one-time email token; revoke-all; role stays the existing coarse owner/tenant split, scoped by the `property_id`/`tenancy_id` RLS already planned. The full per-property × per-function permission matrix (full/limited/read-only/none, strictest wins) shown in the design is deferred to Phase 5's multi-user work — see note there.
  - `properties` · `persons` (document-exact names, doc numbers, DOB) · `tenancies` (property ↔ primary tenant, term dates, notice days, **due day, reminder lead times and other timing settings**, status) · `tenancy_occupants`
  - `field_policies` (entity, field, 3-way policy) · `audit_log`
- Seed: `seed.demo.ts` (synthetic) committed; `seed.real.ts` gitignored. CI (lint, typecheck, tests) runs on synthetic data only. Vercel + Supabase envs, Sentry.

**Accept:** both roles log in (OAuth or magic link, invite-only) and see role-appropriate shells in HU and EN; RLS test proves tenancy isolation; admin can invite a user via one-time token and revoke it; repo contains zero real-world data.

## Phase 1 — Billing core, meter flow, backup (MVP, replaces the Google Sheet)

- Charge model: `charge_types` (fixed / metered / **tracked-only** — provider-billed directly, e.g. gas; recorded for the tenant breakdown but not charged — / one-off), each independently switched on/off per property (design-time addition — `design/07 Utilities Charts.dc.html`, `design/11 Property Metadata.dc.html`); `charge_schedules` (`valid_from`/`valid_to`), `adjustments` (± amount, reason, target month). Statement line items, tenant breakdown and charts must all build from this config — never hardcode a fixed set of categories.
- Meters & readings: `meters`, `meter_readings` (entered/ocr/confirmed columns per CLAUDE.md §3.4), **meter set, reading scope and frequency configurable per flat** (design-time addition — `design/03 Tenant Meter Flow.dc.html`, `design/06 Admin Readings Verification.dc.html`; the submission and verification flows render from this config, not a fixed meter list). **Phone-first tenant flow**: browser camera capture per meter (capture attribute; evaluate getUserMedia live preview) + file-upload fallback, typed value with ≥previous validation; admin verification; meter-replacement flow.
- Statement engine per CLAUDE.md §3.3: draft→issued (immutable snapshot)→partially_paid/paid/overdue; `payments` (many per statement). Due day + all lead times read from tenancy settings.
- **Google Sheet importer** (one-off, CSV in): recreates the full history. Golden tests: every month's payable matches the export to the forint; edge cases covered (mid-history rate change, negative adjustment, deposit-offset months, split payments). Real fixture in `/private`, synthetic twin in repo.
- Amount-due delivery: bilingual Resend email (total, payment methods, due date, portal link) + `wa.me` deep-link button.
- **Backup v1**: admin one-click export — full DB (JSON+CSV) + assets zip, with "data only (no pictures)" toggle; nightly GitHub Action dump (db + storage) with documented, once-tested restore.
- Tenant portal v1 (read-only): amount due + due date, statement history, meter history, key rental data, own/co-occupant details.
- Admin: property/tenancy/person CRUD — **field-requirement engine** (design-time addition — `design/11 Property Metadata.dc.html`, `design/12 Personal Data.dc.html`): personal-data field mandatoriness driven by property metadata / inhabitant registration type (main address → ID number + address card required; temporary; casual; owner/agent → name only), always explainable in-UI ("required because…") — rate management with history, statement review/issue, payment recording.
- Charts v1: per-meter consumption, monthly cost stacked bars.

**Accept:** a full monthly cycle executed in-app (photo submission → verification → statement → email/WhatsApp → payment), output identical to the sheet; backup zip restores locally; sheet becomes read-only archive.

*(Optional, once this milestone is live: a demo environment becomes worth building — see "Demo environment" in `IDEAS.md` for the in-database `is_demo`-flag approach, seeded via `seed.demo.ts` and served read-only. Not scheduled; pick up opportunistically.)*

## Phase 2 — Documents, contract, inventory

- Contract module: version chain per tenancy; scanned PDF + searchable text (`tsvector`); structured key terms driving tenancy record and reminders.
- **Contract intake parsing**: on upload, extract text (digital PDF directly; scans via OCR — OpenRouter multimodal acceptable here already) → propose prefilled key terms → **admin reviews field-by-field, nothing auto-committed**.
- Deposit ledger (paid / applied / retained / refunded transactions); backfill real history from `/private` seed.
- Generic attachments component reused everywhere.
- Document template generator: recurring official declarations (HU/EN) rendered to PDF from person + property data.
- Inventory module per CLAUDE.md §3.9 incl. conditional-ownership `action_by` flags, photo gallery, move-in/move-out snapshots & handover protocol, **manual reconfirmation campaign** (full or subset; item-by-item tenant confirmation with optional photo; discrepancies auto-open requests).
- Tenant sees contracts, inventory, deposit status.

**Accept:** existing signed contract uploaded → parsed → confirmed terms populate the tenancy; conditional-ownership item representable; declaration PDF generated in both languages; manual inventory reconfirmation round-trips.

## Phase 3 — Workflows: requests, notices, editability

- Requests: category + attachments → threaded conversation → resolve/reject/withdraw; external case ref + appointment date; admin dashboard with filters.
- Notices/announcements per CLAUDE.md §3.8 incl. formal warnings citing contract clauses with sequence; acknowledgement tracking; immutable archive.
- Field-level editability: 3-way policy admin UI; `free` edits (apply + history + notify); `approval_required` change-request flow; before/after audit views.
- Notification centre (in-app) + email fan-out; per-user notification preferences.

**Accept:** tenant edits a free field (admin notified), a protected field change requires approval, a formal warning is issued and acknowledged — all with audit trail.

## Phase 4 — Automation & polish

- Vercel Cron (all lead times configurable): meter-reading reminders, payment-due reminders, overdue detection → suggested late-payment notice, contract-expiry and rent-review reminders, inventory `action_by` alerts, **scheduled inventory reconfirmation triggers** (e.g. annually).
- Statement auto-draft on month close when readings are verified; one-click issue.
- Admin analytics: yearly cost/consumption comparisons, payment punctuality, rate-history overlay.
- UX polish, empty states, mobile refinements, PDF statement export.

**Accept:** a month passes with no manual initiation — reminders fire, statement drafts itself, admin issues in one click.

## Phase 5 — AI features + expansion

- **Meter-photo OCR**: OpenRouter multimodal (cheap model, id configurable) proposes value + confidence on submission; human confirms; below-threshold falls back to manual; accuracy stats tracked to tune model choice.
- **AI-assisted contract drafting**: backend sample template + input sheet + short conversational Q&A that fills gaps and flags anomalies ("no inventory attached — deliberate?"); bilingual DOCX/PDF draft output; admin edits before use. (Pairs with the renewal history — a tenancy accumulates yearly versions.)
- AI-assisted contract parsing v2 (structured extraction of clauses, obligations, termination triggers) feeding the searchable clause references used by formal warnings.
- Second property onboarding (schema-ready; build property switcher, per-property settings), multiple tenancies incl. archives, multi-user (family/friends own their properties via existing RLS scoping).
- **Full access-control matrix** (deferred from Phase 0 — see `design/13 Access Management.dc.html`): per-user × per-property access level (full/limited/read-only/none) plus per-function overrides, strictest wins; replaces the coarse owner/tenant role once more than one owner exists.
- German locale (`de`) — catalog translation only.

## Handoff notes for Claude Code (Opus, high thinking effort)

- Work phase by phase; within a phase: schema/migrations → server logic + tests → UI.
- UI: recreate `design/*.dc.html` pixel-perfectly with shadcn primitives (files 01–08, 10–13 are high-fidelity; file 09 is wireframe-only — style it from the token set). The `.dc.html` files are HTML mockups for visual reference, not code to port — ignore `design/support.js`.
- Plan mode before each phase; present schema diffs for approval before migrating.
- Golden tests are the billing engine's contract — do not proceed past Phase 1 while any month mismatches.
- Privacy rule (CLAUDE.md §0) is absolute: no real data outside `/private`, ever — including test names and commit messages.
- Keep every entity property-scoped even while the UI assumes one property; no singletons.
- Bilingual from the first component — retrofitting i18n is the most expensive mistake available here.

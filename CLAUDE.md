# CLAUDE.md — Flatlord (working name)

Project brief and domain context for Claude Code. Read this fully before writing any code. `ROADMAP.md` defines build order; `IDEAS.md` holds loose future ideas. Do not start a phase before its predecessor is accepted.

## 0. Privacy rule (read first)

This file is **public-safe**: every name, amount, date and identifier below is **synthetic/illustrative**. Real-world data (actual contract, parties, meter history, bank details, golden-source spreadsheet export) lives exclusively in the **gitignored `/private` directory**:

```
/private
  PRIVATE.md          # real-world context notes for local sessions
  seed.real.ts        # real seed data (admin's own deployment)
  sheet-export.csv    # real golden-source export → golden tests
```

Rules: `.gitignore` contains `/private` from the first commit. The repo ships synthetic equivalents (`seed.demo.ts`, `fixtures/sheet-demo.csv`) so CI and demos never need real data. Golden tests read a fixture path from env — locally it may point to the real CSV, in CI always the synthetic one. Never hardcode personal data (names, document numbers, bank accounts, addresses, real amounts) in code, tests, comments, commit messages or UI defaults. If Claude Code encounters real data in `/private`, it must not copy it anywhere outside `/private`.

## 1. What this is

A private flat-rental management app for a single landlord (the admin) and his tenant. It replaces a workflow currently spread across email, WhatsApp and a Google Sheet (the golden source of monthly payables). Non-commercial; later shareable with family/friends. Start simple, but every schema and API decision must anticipate: multiple properties → multiple tenancies → multiple owner users.

## 2. Stack

**Confirmed base:** Next.js (App Router, TypeScript strict) on Vercel · Supabase (Postgres, Auth, Storage, RLS, Edge Functions) · Tailwind + shadcn/ui · recharts · next-intl (hu/en, de-ready) · Resend (email) · Vercel Cron · OpenRouter (AI features).

**Proposed amendments** (good fits; admin is open to new tech — introduce with a one-paragraph rationale in the PR):

- **Drizzle ORM** over raw supabase-js for schema-as-code, typed queries and migration diffing (keep supabase-js for Auth/Storage/Realtime). Alternative: supabase-js + generated types if Drizzle feels heavy — decide in Phase 0 and stick with it.
- **TanStack Query** for client-side data fetching/caching; **react-hook-form + zod** for all forms.
- **Vitest** (unit, billing golden tests) + **Playwright** (e2e).
- **@react-pdf/renderer** for generated PDFs (statements, declarations); **unpdf/pdf.js** for text extraction from digital PDFs; OCR of scans via OpenRouter multimodal (no self-hosted Tesseract unless cost demands).
- **Sentry** free tier for error tracking (both interfaces used by non-developers).
- Backups: **GitHub Actions nightly workflow** (pg_dump via Supabase CLI + Storage sync) in addition to the in-app export — see §3.10.

## 3. Core product rules

### 3.1 Roles & interfaces
- **Admin (owner)**: full CRUD; configures properties, tenancies, charge types, rates, field editability, due day and reminder lead times; issues statements and notices; approves change requests.
- **Tenant**: sees only their tenancy — key rental data, own & co-occupant details, statement history, amount due, meters, contract documents, inventory, requests, notices. Edits only what field-level policy allows.
- Single Supabase project, RLS everywhere from day one: every domain table carries `property_id`/`tenancy_id`; tenants scoped to their tenancy, admins to properties they own. This makes multi-property/multi-user later a data change, not a schema change.

### 3.2 Parties, contracts & versioning (domain patterns, synthetic examples)
- Persons carry identity-document-exact name fields plus document numbers (ID card / passport / residence permit) and DOB — spelling corrections against passports are a real recurring case, so document data must be editable with history.
- Co-occupants (e.g. spouse + child) are named in the contract; occupancy restricted to listed persons; guests allowed temporarily (configurable max duration).
- Contracts are **renewed in versions** (a real tenancy can accumulate 4+ annual versions); each version has definite term dates, notice period, and references its predecessor → version chain with lineage, never a single mutable record.
- Rent can be **phased within one contract** (e.g. X HUF until a date, then owner may revise with N-day notice) → rent is an effective-dated schedule, never a single column.
- **Deposit ledger**: deposits get paid, partially applied to fees (possibly spread over months), retained as security, refunded minus deductions → transaction history, not a balance field.
- Payment terms: monthly in advance; **due day configurable per tenancy** (e.g. 5th); multiple receiving accounts (bank IBAN, Revolut tag); cash exceptional.
- Termination mechanics to represent: N-day written notice both ways; immediate-termination triggers (payment default uncured after notice; misuse/noise/house-rule violations); holdover charge (multiple of daily rent).
- Owner-granted permissions with lifecycle (e.g. permanent-residence registration consent, revoked at termination). Email counts as written communication.

### 3.3 Billing engine
- Charge definitions are **effective-dated** (`valid_from`/`valid_to`): recurring fixed (rent, common cost, internet), metered (rate per unit per meter), one-off adjustments (± amount, reason, target month — both surcharges and discounts/credits occur in practice, including recurring surcharges for a bounded period).
- Monthly statement = fixed items in force that month + Σ(meter deltas × rate in force) + adjustments. Lifecycle: `draft` → `issued` → `partially_paid` → `paid` / `overdue`. Issuing snapshots all inputs immutably; corrections via new adjustment lines, never edits to issued statements.
- Payments: **multiple transactions per statement** (split/partial payments occur in reality), each with date, amount, method, note. Overdue = unpaid after the configurable due day.
- **Configurable timing everywhere**: due day, meter-reading window, and every reminder lead time are per-property/tenancy settings, not constants.
- Historical migration: one-time importer for the Google Sheet CSV export. **Golden tests: computed totals must match the sheet to the forint** for every historical month (real fixture gitignored, synthetic fixture in repo covering the same edge cases: rate change mid-history, negative adjustment, deposit-offset months, split payments).

### 3.4 Meters & readings — phone-first workflow
- A property has **N meters** (electricity kWh, gas m³, multiple water meters sharing a tariff…), each with a base value at tenancy start. Meter replacement starts a new meter record with a new base value.
- Tenant submission is a **mobile-first camera flow**: browser-triggered camera capture (`<input type="file" accept="image/*" capture="environment">`, upgrade to getUserMedia live preview if worthwhile) + optional plain file upload fallback; then typed value entry per meter with ≥previous validation (admin can override).
- Admin verifies/edits readings; only verified readings become billable.
- Table designed for AI from day one: `entered_value`, `ocr_value`, `ocr_confidence`, `confirmed_value`, `confirmed_by`. Phase 5 wires OpenRouter multimodal to propose values; human always confirms.

### 3.5 Field-level editability (3-way switch)
Every tenant-visible attribute has a policy: `read_only` | `approval_required` | `free`. Default `read_only`.
- `free`: applies immediately, writes history, notifies admin.
- `approval_required`: pending change request (old → new, note, optional attachment) → admin approves/rejects; history records actor and approver.
- Full audit history on all edited entities (who, when, before/after). Never hard-delete; status flags.

### 3.6 Documents & contract
- Supabase Storage, RLS-mirrored buckets. Contract module: scanned signed PDF + **searchable text version** (`tsvector` full-text search) + structured key terms (term dates, rent schedule, deposit, notice days) driving tenancy records and reminders (term expiry −60/−30 days, rent-review windows — lead times configurable).
- **Contract intake parsing**: on upload of an existing contract, optional extraction (text layer, or OCR for scans) proposes prefilled structured terms; admin reviews field-by-field before anything is saved. Never auto-commit parsed values.
- **Contract drafting** (later phase): backend-stored sample template + input sheet + short conversational AI-assisted Q&A that fills gaps and flags anomalies (e.g. "no inventory attached — deliberate?"). Output: bilingual DOCX/PDF draft for offline signing.
- Generic attachments on tenancies, persons (ID docs), inventory items, requests, notices, statements.
- Document template generator for recurring official declarations (e.g. accommodation-provider consent, address-registration consent), bilingual, rendered to PDF from DB data.

### 3.7 Requests workflow (tenant ↔ admin)
`open` (tenant, optional attachments) → threaded replies/documents both ways → `resolved` | `rejected` | `withdrawn`. Categories: repair, contract change, personal-data change, inventory, billing question, other. Fields for external case reference (insurer/service cases with worksheets are a real pattern) and appointment date (service visits need tenant-availability coordination). Every transition notifies the other party.

### 3.8 Notices & announcements (admin → tenant)
Types: `info`, `house_rule`, `payment_reminder`, `late_payment`, `formal_warning`, `contract`. Formal warnings cite a contract clause and carry a sequence (first/second/final) — this mirrors real usage. Delivery: in-app + email; acknowledgement tracked (explicit acknowledge for formal ones). Immutable once issued.

### 3.9 Inventory module
Fields: id, title, description, photos, date added, `owned_by` (owner | renter | **conditional**), condition, notes, `action_by` date + flag/reason (real case: appliance ownership transfers depending on tenancy end date), status (active/removed/transferred). Move-in/move-out snapshots (handover protocol with photos + meter baselines). **Reconfirmation campaigns**: admin triggers (manually or on a schedule, e.g. annually) a reconfirmation of all or a subset of items; tenant confirms condition/presence item-by-item (with optional photo); discrepancies open requests automatically.

### 3.10 Backup & data ownership (early requirement)
Free-tier stack ⇒ no guaranteed retention. From Phase 1:
- **In-app export (admin)**: one-click downloadable dump — full DB content (JSON + CSV per table) **plus assets**, with a "data only" toggle that skips rich content (photos/scans). Zip streamed to browser.
- **Automated**: nightly GitHub Action running `supabase db dump` + Storage sync, retained as encrypted artifacts / private repo; document a restore procedure and test it once.
- Export format versioned so future imports/restores are feasible.

### 3.11 Notifications
In-app notification centre + email (Resend). WhatsApp MVP = "Send via WhatsApp" button generating a `wa.me` deep link with the prefilled amount-due message; WhatsApp Business API explicitly deferred (see IDEAS.md). Amount-due message template: total, payment methods, due date, portal link — bilingual.

## 4. i18n

`next-intl`, locales `hu` + `en` shipped, structure ready for `de`. All user-visible strings via catalogs — no hardcoded copy anywhere including emails, PDFs, enum labels, validation errors. Per-user locale; locale-aware date/number/HUF formatting. User-entered free text stored as-is.

## 5. Design language

Sleek, modern, friendly-professional. Explicitly **not** the borderless all-white look: reference is pre-2020 Microsoft clarity (Office-2010-era structure) with modern polish — visible card borders and subtle shadows, warm-grey app background, white surfaces, clear section headers, one confident accent colour + semantic paid/overdue/warning colours, dense-but-legible tables, dark mode from day one (CSS variables). Fully responsive; the tenant lives on a phone — the meter flow especially is designed mobile-first. Interactive charts (recharts): per-meter consumption over time, monthly cost stacked bars, payment punctuality — tooltips + month-range selector.

## 6. Engineering conventions

- Zod validation at every boundary (forms, server actions, importers). Server Actions / route handlers for mutations; service-role key never reaches the client; RLS is the last line of defence, not the only one.
- DB: snake_case, plural tables; every table `id uuid`, `created_at`, `updated_at`; migrations in repo (Supabase CLI / Drizzle Kit); seed scripts: `seed.demo.ts` committed, `seed.real.ts` gitignored.
- Money: integer amount (`amount bigint`, currency-neutral name — don't bake HUF into table/field names even though it's the only currency in practice today, see IDEAS.md) + `currency char(3) default 'HUF'` for generality. Meter values: `numeric`.
- Tests: billing golden tests (fixture-driven), RLS tests (tenant cannot read foreign tenancy), Playwright happy paths (submit reading → issue statement → notify → record payment).
- Personal-document numbers masked in UI except admin detail views; never logged.

## 7. Name candidates

"Rentory" is taken — dropped. Checked July 2026 on GitHub, no collisions found for the following; verify GitHub/npm/domain again before creating the repo:

| Name | Rationale |
|---|---|
| **Flatlord** (recommended) | punchy, memorable, exactly what it is; clean for repo/npm |
| **Flatcierge** | playful concierge derivation; flat + concierge |
| **Housekpr** | vowel-dropped housekeeper; modern, unique |
| **Rentcierge** | concierge angle, rent-centric |

Repo suggestion: lowercase single word (`flatlord`) — no Git/npm conflict issues.

## 8. Out of scope (do not build)

Commercial multi-tenant SaaS features, online payment collection, accounting/tax exports, WhatsApp Business API, native mobile apps (responsive web only), tenant-to-tenant features. Certified-billing integration (számlázz.hu) is research-only for now — see IDEAS.md.

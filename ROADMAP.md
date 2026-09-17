# ROADMAP.md — Flatlord build plan

Sequencing authority for **open** work. Companions: `CLAUDE.md` (domain rules, read first), `BACKLOG.md` (triaged, sized items incl. tech debt), `IDEAS.md` (unscheduled), `docs/DECISIONS.md` (standing decisions — don't re-litigate), `docs/DELIVERY-LOG.md` (everything shipped, with scope cuts), `docs/NEXT-BATCH.md` (current recommended next three), `design/` (UI handoff; `design/README.md` has the tokens and the per-screen spec).

**How to read this file.** Phases list only what is still open. Every open item carries a **Done means** line — that is the verification bar a session must meet before calling it shipped (real dev-project click-through, not "tests pass"). Shipped items move to `docs/DELIVERY-LOG.md`; do not accumulate status prose here.

## Status at a glance (2026-09-15)

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation | Shipped 2026-07 |
| 1 | Billing core, meter flow, backup | Shipped, prod-live (32 historical statements golden-verified). Real prod acceptance run still pending — admin action |
| 2 | Documents, contract, inventory | Shipped. Scanned-contract OCR → Phase 5; move-in/out snapshots → `BACKLOG.md` B-13 |
| 3 | Requests, notices, editability, notifications | Shipped |
| 4a | Automation core | Code complete (all cron shapes, auto-draft, PDF). **Unprovable live until `CRON_SECRET` is set** — admin action |
| 4b | Reporting & owner tools | In progress — PR #33 (cumulative ledger + timeline) merged; remainder open |
| 4c | **UI fidelity pass** (new, 2026-09-15) | In progress — items 1–2 shipped 2026-09-17 (PRs #37/#38); items 3–6 open |
| 5 | AI features + expansion | Not started |

## Phase gates → admin checklist (decided 2026-09-15)

The "do not start a phase before its predecessor is accepted" rule was suppressed for every transition so far (1→2 on 2026-08-07, 3→4 on 2026-09-04, 4a/4b split on 2026-09-10) and no phase has ever been formally Accepted. Decided (`docs/DECISIONS.md` D-04, admin 2026-09-15): the gate ritual is dropped; a phase is *closed* when its rows in the checklist below are ticked. Sessions treat the checklist as the operative list and never block on gates.

### Admin actions pending (only the admin can do these — sessions must not)

- [ ] **Set `CRON_SECRET`** in Vercel (prod + preview). Before flipping: the overdue query has no date floor, so the first authenticated run alerts once on every historical statement still `issued`/`partially_paid` past due — count them in the Supabase dashboard first (the 2026-09-10 retroactive-issue grace removes most). Tenant-addressed reminders won't deliver until Resend leaves sandbox (next item).
- [ ] **Buy a domain** (`BACKLOG.md` B-01 — Cloudflare Registrar or Porkbun, not Vercel's registrar) and verify it in Resend. Unblocks real tenant email, the Phase 1 acceptance run, and a non-`vercel.app` URL. The one purchase this review recommends.
- [ ] **Phase 1 real acceptance run**: one real statement walked photo → verification → statement → email/WhatsApp → payment, total identical to the sheet. Confirm-first, real person involved.
- [ ] **Retire the Google Sheet** to read-only after that run.
- [ ] **Deposit-ledger real backfill** from `/private` (writes real financial data to prod).
- [ ] **D-06 ad-hoc notes**: tentatively admin-only + audited; the admin wants a short design note before it's final (see `docs/DECISIONS.md`). Everything else from the 2026-09-15 review is decided.

## Phase 4a — automation core (code complete)

- Nothing left to build. The "UX polish, empty states, mobile refinements" bullet is folded into Phase 4c.
- **Accept (4a):** a month passes with no manual initiation — reminders fire, statement drafts itself, admin issues in one click. Observable only after `CRON_SECRET` is set; when it is, the first month's cron responses (`/api/cron/daily-reminders` JSON) are the evidence.

## Phase 4b — reporting & owner tools

- **Admin analytics, remainder** (PR #33 merged the cumulative "billed vs received" ledger + event timeline): yearly cost/consumption comparison; payment-punctuality chart; rate-history overlay on the consumption chart; rent-vs-pass-through split on the billed curve. **Done means:** each chart renders on the admin tenancy page from real dev data; a unit test guards that nothing under `src/app/(tenant)` imports the analytics loaders (tenant never sees cumulative totals — D-15).
- **Ad-hoc notes** on tenancy / property / person — undated, dated, period-based. Reuse `logAudit()` + field-policy machinery, not a fresh audit path. Joins the event timeline when built. **D-06 is tentative** (admin-only + audited) — present a short design note and get a go-ahead before the migration. **Done means:** create/edit/void a note of each flavour as admin; timeline shows it; tenant visibility matches the decision.
- **Owner income breakdown for tax**: admin report with period selector (default last full calendar year), basis toggle (rent-only vs all inbound), manual adjusting items, editable PIT rate (default 15%, reconfirm at build), PDF via `@react-pdf`. Income side only. **Done means:** report totals reconcile to the payments table for the period; PDF renders in both locales.
- ~~Nav wayfinding~~ — icons + active state shipped in PR #34; per-section accent colours dropped (D-08).
- ~~Avatars~~ — moved back to `IDEAS.md` (cost/benefit).

## Phase 4c — UI fidelity pass (new)

**Why:** `design/*.dc.html` is a complete, high-fidelity handoff, and the token set was ported faithfully into `globals.css` — but the component layer stayed on shadcn base-nova defaults and the key screens were built as functional stacks, not as the designed pages. The admin dashboard is two placeholder cards against a design of eight widgets. Ordered so that each step makes every later screen cheaper.

~~1. Component layer to tokens~~ — shipped PR #37, 2026-09-17: button/input/table/badge/section-header/page-header/month-picker/effective-dated-table/audit-drawer/attachment-chip all restyled to `design/01`. Verified on dev in both themes; **owner visual sign-off against the mockup still open** (functional/no-regression verification is not the same claim). Note: this shipped a second `MonthPicker` component alongside the pre-existing controlled one — `BACKLOG.md` B-27.

~~2. Admin dashboard = `design/04`~~ — shipped PR #38, 2026-09-17: overdue alert, property & term card, billing-cycle stepper, outstanding card, recent statements table, needs-attention queue, both charts, all from real parallelised queries. Verified on dev with real billing data in both themes, zero console errors; **owner visual sign-off against the mockup still open**.

3. **Admin statement detail = `design/05`**: line items grouped fixed / metered (rate chips, reading deltas) / adjustments, immutability note, payments panel, **delivery log** (email/WhatsApp sends persisted), history. Note: delivery log needs a small table — schema first.
4. **Tenant home + meter flow = `design/02` + `design/03`**: hero card with "how it's calculated" expander, one primary CTA + reading-window hint, secondary CTA, notices strip, consumption mini-chart; meter flow frames including the lower-than-previous error state and "send note to owner" escape.
5. **Readings verification = `design/06`**: queue + detail, photo viewer with zoom, keyboard shortcuts (↵ verify, E edit, R retake), the AI-proposal slot rendered empty.
6. **Remaining screens** from `design/09` wireframes at token level; empty states, loading skeletons, error pages; admin shell below `md` gets a real navigation (B-19).

**Accept (4c):** the owner compares each ported screen against its mockup and signs off; both themes; tenant screens at 390px, admin at 1440px. Items 1–2 are built and functionally verified but **not yet owner-signed-off** — that sign-off is still the Accept gate for 4c as a whole, not a formality.

## Phase 5 — AI features + expansion

- **Meter-photo OCR**: OpenRouter multimodal (model id configurable) proposes value + confidence on submission; human confirms; below-threshold falls back to manual; accuracy stats tracked. **Done means:** a submitted photo shows a proposal chip on the verification screen; confirming writes `confirmed_value`/`confirmed_by`; a test covers the fallback.
- **Scanned-contract OCR** (deferred from Phase 2, D-16): wire the multimodal call into `src/server/contracts/parse-contract.ts`; closes Phase 2's one unproven leg (real scanned contract → parsed → terms populate the tenancy). `OPENROUTER_API_KEY` is in `.env.local`, not Vercel.
- **AI-assisted contract drafting**: stored sample template + input sheet + short Q&A that fills gaps and flags anomalies; bilingual DOCX/PDF draft; admin edits before use. Prerequisite worth deciding first: termination mechanics / permissions lifecycle are not modelled (`BACKLOG.md` B-14).
- **Contract parsing v2**: structured clauses/obligations/termination triggers feeding the clause references used by formal warnings.
- **Second property onboarding**: property switcher, per-property settings, multiple tenancies incl. archives, multi-user via existing RLS scoping.
- **Full access-control matrix** (`design/13`): per-user × per-property level + per-function overrides, strictest wins.
- **Email-address change workflow** through Supabase Auth's own confirmation; keep `invites.email` in sync; audited.
- **Emergency/admin-generated login link** for any user; replaces the raw-DB invite insert used to bootstrap the first owner.
- **German locale** — catalog translation only.

## Handoff notes for sessions

- Start with `docs/NEXT-BATCH.md`; it is valid while `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md`. Otherwise re-derive from this file.
- Within a batch: schema/migration → server logic + tests → UI → **headless Playwright click-through against the dev project** (`playwright-owner-emma@flatlord.test`, `playwright-tenant-a@flatlord.test`, login via `auth.admin.generateLink`) → PR. "CI green" is not "verified live".
- Prod migrations only via `.github/workflows/migrate-prod.yml` (D-14). Never hand-apply.
- Golden tests are the billing engine's contract: never merge with a mismatching month.
- Privacy rule (`CLAUDE.md` §0) is absolute — including test names and commit messages.
- Every entity stays property-scoped even while the UI assumes one property; no singletons.
- Bilingual from the first component; no hardcoded copy.
- UI work ports `design/*.dc.html` (files 01–08, 10–13 hi-fi; 09 wireframe). The mockups are references, not code; ignore `design/support.js`.

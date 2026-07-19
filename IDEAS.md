# IDEAS.md — Flatlord future ideas (unscheduled backlog)

Loose ideas, deliberately not committed to any phase. Pick up opportunistically or promote to ROADMAP.md when concrete.

## Integrations

- **számlázz.hu (or Billingo) integration** — certified Hungarian invoicing. Not a legal requirement between natural persons; needs research: API capabilities, whether issuing invoices creates NAV reporting obligations for a private landlord, cost tiers. Outcome could range from "generate a payment receipt PDF ourselves" to full invoice issuance per statement.
- **WhatsApp Business API** sending (replace the `wa.me` deep-link); evaluate cost/verification burden vs. benefit for a 1-tenant use case.
- **Bank-statement reconciliation helper**: paste/upload statement rows (CSV) → fuzzy-match against open statements → suggest payment records. Later: bank API (GoCardless/Nordigen-style open-banking read access).
- **Calendar**: iCal feed or Google Calendar sync for appointments (service visits, showings), contract milestones, reading windows.

## Modules & features

- **Owner-side expense tracking**: maintenance, insurance, common-cost invoices per property → yearly profitability view; would also feed a tax-summary export (HU flat-rate rental taxation) — research before building.
- **Renewal wizard**: generate next contract version draft from current terms + new rent schedule (largely covered by AI contract drafting; keep as the non-AI fallback path).
- **Tenant onboarding checklist**: house-rules acknowledgement, key handover, address registration, meter baselines — one guided flow at tenancy start.
- **Move-out wizard**: notice → showing appointments (short-notice permission is contractual) → final readings → deposit settlement calculation → handover protocol → permission revocations.
- **Utility-rate review nudge**: alert when unit rates haven't been reviewed for 12 months (history shows correction lag) or when computed cost persistently under/overshoots actual provider bills.
- **Invoice-based unit-cost derivation + evidencing**: parse an uploaded utility invoice (electricity/gas/water bill — text layer or OCR for scans, same intake pattern as contract parsing) to extract consumption + fee and propose a derived unit rate (mirroring the "round up to cover fixed costs" methodology already used manually), admin reviews before it becomes a new effective-dated `charge_schedule` row; the source invoice attaches to that schedule change as evidencing, not just a number typed in. Complements the review-nudge idea above — this is the input mechanism, the nudge is the trigger.
- **Photo archive timeline** per property: handovers, damages, repairs — chronological gallery.
- **EUR-based pricing** (or other non-HUF currency) — not viable for a Hungarian residential tenancy today (HUF is the only currency actually used or contemplated), but the money columns are deliberately currency-neutral (`amount`, not `amount_huf` — CLAUDE.md §6) precisely so this stays a config change, not a rename, if it's ever a real requirement (e.g. the app growing beyond this one property/country). `statements`/`payments` already carry `currency char(3)`; `charge_schedules`/`adjustments`/`statement_line_items` don't yet — they implicitly inherit the parent statement/tenancy's single currency. Supporting a genuinely mixed-currency tenancy would need `currency` columns at those finer grains too, plus a currency-consistency check between a statement and its line items, plus FX-rate handling for any cross-currency adjustment or payment — real design work, not a flag flip.
- **Tenant FAQ / knowledge page** per property: house rules, appliance manuals, building policies, emergency contacts.

## AI (beyond roadmap Phase 5)

- Anomaly detection on consumption (leak/faulty-meter warnings when a delta is a statistical outlier — history contains such swings).
- Natural-language query over the tenancy archive ("when did we replace the fridge?", "sum of adjustments in 2025") via structured-data RAG.
- Auto-drafted bilingual notice texts from a category + few keywords, always admin-reviewed.
- Photo-based inventory condition comparison (move-in vs reconfirmation photos).

## Demo environment

- **In-database demo mode, not a second Supabase project.** Free-tier Supabase caps active projects at 2 per org, and a separate `flatlord-demo` project would fight the CI project (see Phase 0's CI setup) for that slot, plus needs its own keep-alive against the 7-day inactivity auto-pause. Cheaper: seed synthetic demo rows into the *same* production database, tagged, and gate visibility by the tag instead of by database.
  - `is_demo boolean not null default false` on **root-level entities only** — `properties` and `persons`. Everything else (tenancies, statements, meters, adjustments…) hangs off `property_id`/`tenancy_id`, so it's demo-scoped transitively without touching every table.
  - Real users need **no RLS changes at all**: a real admin's `property_ownership` rows and a real tenant's `tenancy` never point at a demo property in the first place, so today's ownership-scoped policies already exclude demo data by construction.
  - Seeding: a variant of `seed.demo.ts` (same synthetic-data spirit, same privacy rule) that inserts with `is_demo = true`, re-runnable any time via `delete ... where is_demo = true` first — cheap to reset on a schedule or on demand, no cross-project sync.
  - Serving it: a public, unauthenticated `/demo` route rendered server-side through the **service-role client**, hardcoded to `where is_demo = true`. No new login surface, no new RLS branch, so there's no way for it to accidentally surface real data — the query can't reach anything else. Start read-only (view the admin + tenant shells with realistic mock data); a writable sandbox (resettable, isolated per visitor) is a bigger follow-on, not v1.

## Ops

- Uptime/health check ping (the app becomes the system of record; a dead cron shouldn't go unnoticed for a month).
- Supabase → self-host escape hatch documentation (data-ownership continuation of the backup story).
- Periodic restore drill reminder (quarterly cron opening an admin task).

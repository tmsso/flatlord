# IDEAS.md — unscheduled ideas

Loose ideas with no phase and no verification bar yet. Anything with a concrete spec and a "done means" goes to `BACKLOG.md`; anything sequenced goes to `ROADMAP.md`. Pruned 2026-09-15: resolved ops items, the 2026-08-03 owner list (now in Phase 4b / `BACKLOG.md`), and the error-swallowing note (now B-11) were removed; see `docs/DELIVERY-LOG.md` for what happened to them.

## Integrations

- **számlázz.hu / Billingo** — certified Hungarian invoicing. Not required between natural persons; research API, NAV-reporting implications for a private landlord, cost tiers. Outcome could range from "payment receipt PDF" (we already generate statement PDFs) to full invoice issuance.
- **WhatsApp Business API** — replace the `wa.me` deep link; evaluate verification burden vs. benefit for one tenant. Explicitly out of scope today (CLAUDE.md §8).
- **Bank-statement reconciliation helper** — paste/upload bank CSV → fuzzy-match to open statements → suggest `payments` rows. Later: open-banking read access (GoCardless/Nordigen-style).
- **Calendar** — iCal feed / Google Calendar sync for appointments, contract milestones, reading windows.

## Modules & features

- **Owner-side expense tracking** — maintenance, insurance, common-cost invoices per property → yearly profitability; the cost-side companion of Phase 4b's income/tax report. Research HU flat-rate rental taxation before building.
- **Renewal wizard** — next contract version from current terms + new rent schedule; the non-AI fallback of Phase 5 drafting.
- **Tenant onboarding checklist** — house-rules acknowledgement, key handover, address registration, meter baselines in one guided flow.
- **Move-out wizard** — notice → showings → final readings → deposit settlement → handover protocol (B-13) → permission revocations (B-14).
- **Utility-rate review nudge v2** — beyond the shipped `valid_to` reminder: alert when computed cost persistently under/overshoots provider bills.
- **Invoice-based unit-cost derivation** — parse an uploaded utility invoice (same intake pattern as contracts) → propose a derived unit rate → admin reviews → new `charge_schedules` row with the invoice attached as evidence.
- **Photo archive timeline** per property — handovers, damages, repairs.
- **Tenant FAQ / knowledge page** per property — house rules, manuals, emergency contacts.
- **Bilingual statement display + per-tenant email language** — show both hu and en labels on line items; remember the tenant's email language separately from the UI locale. Prerequisite is B-07 (catalog lookup by `charge_types.code`); ad-hoc `code IS NULL` types only ever have one free-text name.
- **Avatars for properties / persons** — optional images + a default-avatar generator with opt-out (library/licensing evaluation first). Moved back here from Phase 4b on 2026-09-15: low value vs. cost while one property and two users exist.
- **EUR / non-HUF pricing** — columns are currency-neutral (D-12) but `charge_schedules`/`adjustments`/`statement_line_items` carry no `currency`; a genuinely mixed-currency tenancy needs those, a consistency check, and FX handling. Not a flag flip.

## AI (beyond Phase 5)

- Consumption anomaly detection (leak / faulty meter) — history contains such swings.
- Natural-language query over the tenancy archive via structured-data RAG.
- Auto-drafted bilingual notice texts from category + keywords, always admin-reviewed.
- Photo-based inventory condition comparison (move-in vs reconfirmation).

## Demo environment

In-database demo mode (D-10): `is_demo` on `properties` and `persons` only (everything else scopes transitively); a variant of `seed.demo.ts` inserting with `is_demo = true`, resettable; a public `/demo` route rendered through the service-role client hardcoded to `where is_demo = true`, read-only first. No RLS change needed — real users' ownership rows never point at demo properties. Worth building once Phase 1's real acceptance run is done and the app is something to show.

## Ops

- **Alert-delivery verification** — the health check and keep-alive rely on GitHub's workflow-failure emails; whether those actually arrive has never been confirmed (check the repo owner's GitHub notification settings, or make a workflow fail on purpose once).

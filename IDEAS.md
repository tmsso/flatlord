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
- **Photo archive timeline** per property: handovers, damages, repairs — chronological gallery.
- **Multi-currency support** activation (schema already carries currency) if ever needed for a non-HUF property.
- **Tenant FAQ / knowledge page** per property: house rules, appliance manuals, building policies, emergency contacts.

## AI (beyond roadmap Phase 5)

- Anomaly detection on consumption (leak/faulty-meter warnings when a delta is a statistical outlier — history contains such swings).
- Natural-language query over the tenancy archive ("when did we replace the fridge?", "sum of adjustments in 2025") via structured-data RAG.
- Auto-drafted bilingual notice texts from a category + few keywords, always admin-reviewed.
- Photo-based inventory condition comparison (move-in vs reconfirmation photos).

## Ops

- Uptime/health check ping (the app becomes the system of record; a dead cron shouldn't go unnoticed for a month).
- Supabase → self-host escape hatch documentation (data-ownership continuation of the backup story).
- Periodic restore drill reminder (quarterly cron opening an admin task).

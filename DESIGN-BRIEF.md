# DESIGN-BRIEF.md — Flatlord UI design handoff

Handoff for Claude (design session) to produce the UI design system and key screens. Companions: `CLAUDE.md` (product rules), `ROADMAP.md` (build phases). This brief is self-contained — read those only if a detail below is ambiguous. **All data in this brief is synthetic; use invented names/amounts in mockups (e.g. "Alex Tenant", "Garden St 12", "245,000 HUF"). Never use real-looking personal data.**

## 1. Product in one paragraph

A private flat-rental manager for one landlord ("admin") and his tenant. Two interfaces on one design system: an **admin panel** (desktop-leaning, data-dense: properties, tenancies, rates, statements, documents, inventory, notices, approvals) and a **tenant portal** (phone-first: amount due, meter photo submission, history, requests, own data). Hungarian + English UI (German later). Non-commercial, personal tool — it should feel like a well-crafted product, not an enterprise dashboard.

## 2. Design direction (the brief's soul)

- Reference: **pre-2020 Microsoft clarity** — Office 2010-era structure and confidence — executed with modern polish. The owner explicitly dislikes today's borderless, all-white, eye-straining flatness.
- Concretely: visible structure (cards with real 1px borders + subtle shadows), **warm-grey app background** with white surfaces (never white-on-white), clear section headers with weight hierarchy, honest affordances (buttons look like buttons).
- One confident accent colour — suggest deep teal or classic MS blue; present 2–3 options. Semantic colours: paid/success green, overdue/danger red, warning amber, info blue. Status must never rely on colour alone (badges with labels/icons).
- **Dark mode from day one** — design both themes via tokens, not as an afterthought. Dark mode must keep the same structured, bordered feel (no pure-black voids).
- Density: comfortable-dense for admin tables (statements, readings, rates), airy for tenant dashboard. Friendly but professional tone; micro-copy warm, never corporate.
- Typography: modern grotesque with excellent Hungarian diacritics support (á é í ó ö ő ú ü ű) and tabular figures for money/meter tables. Suggest 1–2 candidates.
- Charts (recharts will implement): same token palette; gridlines subtle; tooltips styled; month-range selector pattern.

## 3. Users & devices

- **Admin (the owner)**: tech-savvy, uses desktop mostly, phone occasionally. Wants overview → drill-down, fast monthly workflow, confidence that numbers are right.
- **Tenant**: non-native speaker (English UI likely), **phone almost exclusively**, mid-range Android. Needs dead-simple: what do I owe, submit meter photos, ask for something, read notices.
- Breakpoints: design mobile-first for tenant screens; admin screens desktop-first (≥1280) with usable tablet/mobile fallbacks.

## 4. Information architecture

**Admin panel** (sidebar nav): Dashboard · Statements & Payments · Meters & Readings · Property & Tenancy (incl. persons, contract chain, deposit) · Documents · Inventory · Requests · Notices · Approvals · Settings (rates & charges, timing/lead times, field editability, backup/export, languages).

**Tenant portal** (bottom tab bar on mobile): Home · Payments · Meters · Requests · More (my details, co-occupants, contract & documents, inventory, notices archive, language).

## 5. Key screens to design (priority order)

### P1 — must design
1. **Tenant Home**: hero card "Amount due" (big number, due date, status badge, "how it's calculated" expander with line items), quick actions (submit readings, open request), recent notices strip, mini consumption sparkline.
2. **Tenant meter submission flow** (the signature flow, phone-first): list of meters with last reading → per-meter camera capture (browser camera, photo preview, retake) → typed value with ≥previous validation and delta preview → review-all → submitted state. Design each step incl. error states (value lower than previous, photo missing).
3. **Admin Dashboard**: portfolio cards (property, tenancy, term countdown), this-month billing status (readings in? statement drafted/issued/paid?), overdue alert, pending approvals/requests, mini charts.
4. **Admin Statement detail**: line items (fixed / metered with reading deltas & rates / adjustments), totals, lifecycle stepper (draft→issued→paid), payments list (supports multiple partial payments), actions (issue, record payment, send amount-due email/WhatsApp), immutable-after-issue treatment.
5. **Admin Readings verification**: month grid of meters × submitted photos + values, side-by-side photo/value verify UI, edit/override, "all verified → draft statement" CTA. (Future AI: proposed value + confidence chip — design the slot now.)
6. **Utilities chart view** (both roles): interactive consumption per meter over time, cost stacked bars, range selector, hu/en number formats.

### P2 — strongly wanted
7. **Requests** (tenant create + thread view with attachments; admin queue with status filters, external case ref, appointment date).
8. **Notices** (admin compose with type/severity/clause citation + sequence for formal warnings; tenant read + acknowledge flow; immutable archive).
9. **Approvals / change requests**: old→new diff view, approve/reject with note; tenant "my pending changes" state. Include the 3-way editability indicator pattern (read-only / needs-approval / free) used on every editable field.
10. **Inventory**: photo-forward card grid + detail (ownership incl. "conditional" badge, action-by flag), reconfirmation campaign flow (tenant confirms item-by-item with optional photo).
11. **Contract & documents**: version chain timeline, PDF viewer + full-text search, structured key-terms panel, upload-and-parse review screen (field-by-field accept of extracted values).

### P3 — patterns/states
12. Settings (rates with effective-date history table, timing config, field-editability matrix, backup/export with "data only" toggle).
13. Notification centre, empty states, loading skeletons, error pages, email template (amount due) and PDF statement — same visual language.

## 6. Recurring components to systematise

Money display (HUF, tabular, locale-aware "245 000 Ft" / "HUF 245,000") · status badges (statement lifecycle, request status, notice severity, editability) · effective-dated tables (value + valid-from/to) · photo capture/upload tile · attachment chip list · audit-history drawer (who/when/before/after) · lifecycle stepper · month picker · language switcher (hu/en, de-ready) · acknowledge/confirm pattern for formal items.

## 7. i18n & accessibility constraints

- Hungarian runs ~20–30% longer than English; German longer still — no width-critical labels, buttons must tolerate wrapping, avoid ALL-CAPS (breaks diacritics legibility).
- Dates: hu = 2026. 07. 15., en = 15 Jul 2026. Currency per above. Design with both locales in at least one screen to prove resilience.
- WCAG AA contrast in both themes; touch targets ≥44px on tenant flows; camera flow operable one-handed; visible focus states (admin is keyboard-heavy in tables).

## 8. Deliverables expected from the design session

1. **Design tokens** (CSS variables): colour (light+dark), typography scale, spacing, radii, borders/shadows — shadcn/ui + Tailwind compatible.
2. **Component sheet**: the §6 components in all states (default/hover/focus/disabled/error), both themes.
3. **High-fidelity screens**: all P1 screens (tenant ones at 390px, admin at 1440px), both themes for at least Tenant Home + Admin Dashboard; P2 as wireframe-fidelity minimum.
4. Preferred format: static HTML/CSS mockups (single file per screen ok) or annotated images — they will be translated into Next.js + Tailwind + shadcn/ui by Claude Code, so name things in shadcn terms where natural.
5. Short rationale note per major decision (accent colour, type choice, density strategy).

## 9. Anti-goals

No borderless all-white minimalism · no gradient-heavy dashboard kitsch · no illustration-heavy onboarding style · no colour-only status · no desktop-only thinking on tenant flows · no lorem ipsum (use synthetic domain copy in hu or en).

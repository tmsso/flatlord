# Handoff: Flatlord UI — design system + key screens

## Overview
Flatlord is a private flat-rental management app (single landlord, few properties, Hungarian context). This package hands off a complete UI design system and 13 screens to be implemented in **Next.js + Tailwind + shadcn/ui** per the project's DESIGN-BRIEF.md. Direction: pre-2020 Microsoft clarity with modern polish — warm-grey app background, white surfaces, visible 1px borders + subtle shadows, one confident accent (deep teal), first-class dark mode, hu+en i18n.

## About the Design Files
The `.dc.html` files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code. The task is to **recreate these designs in the target Next.js + Tailwind + shadcn/ui codebase** using its established patterns (shadcn components, Tailwind theme, recharts for charts). Open each file in a browser; most have Light/Dark and HU/EN toggles in the top bar (these toggles are mockup chrome, not part of the product UI). `support.js` is the mockup runtime — ignore it.

## Fidelity
- **High-fidelity**: files 01–08, 10–13. Recreate pixel-perfectly with shadcn primitives.
- **Wireframe**: file 09 (P2 screens: requests, notices, approvals, inventory, contract). Use for layout/flow; style from the token set.

## Design Tokens (shadcn/Tailwind theme)
Defined identically in every file's `.fl` scope; move to `globals.css` as `:root` / `.dark`. All colours oklch.

Light:
- `--background: oklch(0.962 0.006 85)` warm grey · `--foreground: oklch(0.25 0.012 75)`
- `--card: oklch(1 0 0)` · `--muted: oklch(0.94 0.007 85)` · `--muted-foreground: oklch(0.49 0.015 75)`
- `--border: oklch(0.872 0.010 85)` · `--input: oklch(0.826 0.012 75)` (form borders one step stronger)
- `--primary: oklch(0.47 0.085 205)` deep teal · `--primary-foreground: oklch(0.99 0.003 200)` · `--ring: oklch(0.55 0.09 205)`
- `--secondary: oklch(0.93 0.008 85)` / fg `oklch(0.30 0.012 75)`
- Semantic (each with `-bg` and `-border` tints for badges): `--success oklch(0.51 0.12 155)` / bg `0.95 0.035 155` / border `0.85 0.07 155`; `--warning 0.50 0.11 70` / `0.955 0.045 85` / `0.85 0.08 80`; `--destructive 0.52 0.185 27` / `0.955 0.028 25` / `0.86 0.06 25`; `--info 0.50 0.12 250` / `0.945 0.028 250` / `0.85 0.055 250`
- Charts: `--chart-1 = primary teal`, `--chart-2 oklch(0.62 0.13 60)` amber, `--chart-3 oklch(0.55 0.11 250)` blue, `--chart-4 oklch(0.55 0.11 300)` violet, `--chart-rent oklch(0.72 0.015 75)` neutral
- Shadows: `--shadow-sm: 0 1px 2px oklch(0.3 0.02 75/0.07)`; `--shadow-md: 0 1px 3px oklch(0.3 0.02 75/0.09), 0 2px 8px oklch(0.3 0.02 75/0.05)`

Dark (same names, `.dark`): background `0.215 0.009 75`, card `0.262 0.010 75`, muted `0.305 0.011 75` / fg `0.705 0.012 80`, border `0.365 0.013 75`, input `0.42 0.014 75`, primary `0.76 0.095 197` / fg `0.21 0.03 200`, success `0.74 0.13 155` (+bg `0.30 0.045 155`, border `0.42 0.07 155`), warning `0.80 0.12 82` (+`0.31 0.05 82`/`0.44 0.08 82`), destructive `0.74 0.15 25` (+`0.30 0.05 25`/`0.44 0.08 25`), info `0.74 0.11 250` (+`0.30 0.04 250`/`0.43 0.07 250`), charts `0.76 0.095 197 / 0.78 0.12 70 / 0.74 0.11 250 / 0.74 0.11 300`, chart-rent `0.48 0.013 75`, shadows on black at 0.35/0.4+0.25. No pure black anywhere.

**Important**: when mixing token colours (tints), use `color-mix(in oklab, …)` — never `in oklch` (hue-rotation artifacts with achromatic card colours; we hit this bug in mockups).

Other tokens:
- Radius: 4 checkboxes · 6 controls · 8 cards (`--radius`) · 999 badges/pills
- Spacing: Tailwind 4px scale; card padding 16–20px; section gaps 24–32px
- Type: **IBM Plex Sans** (400/500/600/700) + **IBM Plex Mono** (serials, hrsz, IDs, token names). Scale: 30/600 display, 24/600 h1, 18/600 h2, 15/600 card title, 14/400 body, 13/400 secondary, 12/500 caption/column headers. `font-feature-settings:'tnum'` on ALL money/meter/date columns. Full Hungarian diacritics (ő ű) required; **no ALL-CAPS ever**.
- Focus: 2px `--ring` outline, offset 2px (inset -2px inside table rows). Admin is keyboard-heavy — every row/control needs a visible focus state.
- Density: admin 36px table rows / 13px table text / 36px controls; tenant ≥44px touch targets, 52px primary buttons, one primary action per screen.
- Locale formats: hu `245 000 Ft`, `2026. 07. 15.` · en `HUF 245,000`, `15 Jul 2026`. Hungarian copy runs 20–30% longer — no width-critical labels.

## Logo
Winner: **C5 "Sheltered free mark"** — house glyph framed by two arcs (shelter above, palm below). SVG paths (viewBox 0 0 28 28, stroke round caps/joins, width 2.2–2.4):
`M7.5 5.6q6.5-3.8 13 0` · `M8 13.8L14 8.4l6 5.4` · `M10.2 13.3v4.4h7.6v-4.4` · `M7.5 22.4q6.5 3.8 13 0`
Applications (see 10): teal on light, light-teal on dark (always `--primary` — never a second brand colour), **white-in-teal-tile** for app icon/sidebar (rounded tile, radius ≈ ¼ size), ink mono for print. Copper/MS-blue were evaluated and rejected (semantic collisions).

## Screens / Files
- `00 Overview.dc.html` — index of all deliverables + decision rationale.
- `01 Tokens & Components.dc.html` — token tables + component sheet: buttons (primary/secondary/outline/ghost/destructive × default/hover/focus/disabled), inputs (incl. error + helper), status badges (statement lifecycle, request status, notice severity), 3-way editability indicators, effective-dated rate table, lifecycle stepper, month picker, language switcher (hu/en/de-disabled), photo capture tile, attachment chips, audit drawer, acknowledge pattern. Accent alternatives (MS blue, slate-indigo) kept as one-line token swaps.
- `02 Tenant Home.dc.html` (390px) — amount-due hero + "how calculated" expander (line items with meter deltas), primary CTA (submit readings) + reading-window hint, secondary CTA (new request), notices strip, consumption mini-chart, 5-tab bottom nav.
- `03 Tenant Meter Flow.dc.html` (390px, signature flow) — 6 frames: meter list with per-meter status → camera (bottom-third controls, one-handed; gallery + skip-with-reason) → value entry (56px numeric input, Δ + estimated cost) → **error state** (lower-than-previous blocks continue; "send note to owner" escape) → review-all → success. Meter set/scope/frequency are per-flat admin config.
- `04 Admin Dashboard.dc.html` (1440px) — sidebar nav with badge counts, overdue alert bar with actions (reminder email / WhatsApp / draft late notice), property+term card (renewal countdown), billing-cycle stepper, outstanding card, statements table (36px rows, tabular, row focus), needs-attention queue, 2 charts.
- `05 Admin Statement Detail.dc.html` — breadcrumb, status badges + "issued — inputs locked", lifecycle stepper, line items grouped fixed/metered/adjustments with rate chips + reading deltas, **immutability note** (corrections = ± adjustment lines, never edits), payments panel (multiple partial payments), delivery log (email/WhatsApp), history.
- `06 Admin Readings Verification.dc.html` — queue (photo thumb, Δ, status) + detail: photo viewer w/ zoom + detected-counter region, tenant value vs **AI proposal + confidence chip** (Phase-5 slot; amber below threshold; never auto-verifies), previous/delta context, confirm input, verify-&-next; keyboard: ↵ verify, E edit, R retake, ↑↓ switch. Overrides audit-logged.
- `07 Utilities Charts.dc.html` — per-meter consumption, series individually toggleable with distinct `--chart-N` colours (each series on own scale, absolute values in detail row/tooltip); cost chart = **two bars per month**: wide rent bar (3× width) + narrow stacked utilities bar (fixed + per-component metered + adjustment layer), area proportional to amount; billing-component config strip. Implement with recharts; tooltip = card + 1px border + shadow-md.
- `08 Logon.dc.html` — Google OAuth button + magic-link email (Supabase Auth), "no self-signup / invited accounts only" note, role decides portal vs admin, hu/en.
- `09 P2 Wireframes.dc.html` — request create/thread/admin queue, notice compose (type/sequence/contract-clause picker, immutable on send) + tenant acknowledge (checkbox-gated), approval diff card (current → proposed + attachment), inventory grid + tenant reconfirmation flow, contract version chain + parse-review (accept per field).
- `10 Logo Ideation.dc.html` — rounds + colour applications.
- `11 Property Metadata.dc.html` — property tree (house/flat/room), type segmented control, **parent rule** (room requires parent flat, address inherited), active/inactive + lettable toggles, hrsz (mono), ownership chips → personal records, **inhabitants by registration type** (main address / temporary / casual).
- `12 Personal Data.dc.html` — person list with completeness badges; form with per-field required markers + editability badges (free / approval-needed / verified-read-only); requirement banner explains the driving rule.
- `13 Access Management.dc.html` — users table (person, sign-in method, role type owner/tenant, per-property level, last sign-in), function-level override matrix (Full/Limited/Read-only/None segmented rows), invite via one-time email token, revoke-all.

## Functional features added during design (beyond the original brief — treat as product requirements)
1. **Dynamic billing components** (07, 11): every charge component is admin-configurable — on/off, fixed vs metered vs tracked-only (provider bills directly, e.g. gas). Supports the fixed-only-monthly + periodic-metered-adjustment billing mode. Charts, statement line items and tenant breakdown must all build from this config, not hard-coded categories.
2. **Per-flat meter configuration** (03, 06): meter set, reading scope and frequency vary by flat; the flow renders from config.
3. **Field-requirement engine** (11 ↔ 12): mandatoriness of personal-data fields is driven by property metadata — registration type (main address → ID number + address card required; temporary; casual) per inhabitant; owner/agent need name only. Requirements must be explainable in-UI ("required because…").
4. **3-way editability policy** (01, 12): every field is free-edit / approval-required (opens change request with diff + approver) / read-only — always shown with icon+label badge, enforced server-side, all changes audit-logged (who/when/before→after).
5. **Statement immutability + adjustments** (05): issued statements are frozen snapshots (rates, readings); corrections are ± adjustment lines or next-draft items; multiple partial payments per statement.
6. **Fine-grained access model** (13): role type (owner/tenant) × per-property level (full/limited/read-only) × per-function overrides, strictest wins; tenant auto-scoped to own tenancy; grants/revokes audit-logged.
7. **Password-less auth** (08, 13): Google OAuth or emailed one-time token only; invite-only, no self-signup.
8. **AI reading-verification slot** (06): OCR proposal + confidence chip, amber under threshold, human always confirms — design the API surface now, ship the model later (Phase 5).
9. **Status = badge + icon + label** everywhere; effective-dated rates with history; lifecycle steppers; formal-notice acknowledge pattern (checkbox-gated, immutable, logged).

## Interactions & Behaviour
- Hover: rows/ghost buttons → `--muted` bg; primary buttons → brightness(0.92–0.95). Focus: `--ring` per above. Disabled: opacity 0.5 + not-allowed.
- Meter-entry validation: new ≥ previous, blocking; admin-only override; meter-replaced escape hatch.
- Theme via `.dark` class on root; both themes AA. Language switcher: hu default, en, de slot disabled.

## Assets
No raster assets. All icons are inline stroke SVGs (~1.3–1.8 stroke, round caps) — map to Lucide equivalents in shadcn. Photo areas in mockups are placeholder hatching — real photos in product. Logo SVG paths above.

## Files
All `.dc.html` files listed above are included in this folder. Ignore `support.js` references; view files directly in a browser.

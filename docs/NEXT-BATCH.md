# Next batch — recommended next three items

Written 2026-09-15 by the Fable review pass. **Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. PR #33 (4b analytics) and PR #34 (review quick wins) should be merged. If either is still open and green, merging is the admin's call (`/ship-pr`), not the batch's first item.
2. Read `docs/DECISIONS.md`. Nothing below is gated on an open decision (the 2026-09-15 review's questions were answered the same day); D-06 (ad-hoc notes) is the only tentative one and is not in this batch.
3. Confirm ship-autonomy for the batch explicitly, per the `/next-batch` skill.

## The three

### 1. Performance batch — `BACKLOG.md` B-02 + B-10 (+ B-18)

Parallelise the per-page Supabase queries on the six heaviest pages, add the FK/RLS-subquery index migration, set `maxDuration` on the backup and PDF routes. Measure before/after on dev with a Playwright timing script and put the numbers in the PR body. This is the first thing the owner will feel after the `fra1` region change lands.

*Done means:* each touched page has ≤3 sequential await stages; index migration applied to dev and prod (via `migrate-prod.yml`); timing table in the PR; Playwright pass on all routes.

### 2. Phase 4c item 1 + 2 — component layer to tokens, then the admin dashboard (`design/01`, `design/04`)

Restyle `components/ui/*` (button sizes/hover, input borders, table density + tabular figures + row focus, badge, page/section headers, month-picker slot), then build the real dashboard: overdue alert bar, property & term card, billing-cycle stepper, outstanding card, recent statements table, needs-attention queue, the two charts. Every widget from real queries, parallelised from the start.

*Done means:* side-by-side screenshots against the mockups (both themes) in the PR; no regressions on existing routes (Playwright); the owner can sign off visually.

### 3. Billing polish — B-05 draft discard/regenerate, then B-06 due-date semantics and B-07 historical charge names

All three are decided (D-05 option b, D-07 render-time labels) — no decision gating this item.

*Done means:* a wedged draft month can be cleared and regenerated; a statement issued today shows a due date in the month after issue; a 2025 statement shows localised charge names in the HU UI and in the PDF; golden tests untouched and green.

## Alternatives if the admin prefers

- Swap item 3 for **B-03 middleware auth** (zero network calls per request) — needs the admin to enable asymmetric JWT signing keys in both Supabase projects first.
- Swap item 2 for **B-08 committed Playwright smoke** if reliability of verification matters more than looks right now.

## Session logistics (unchanged)

`/verify` for lint + typecheck (build/tests need the DB; CI covers them) · real verification against **dev** with `playwright-owner-emma@flatlord.test` / `playwright-tenant-a@flatlord.test`, login via `auth.admin.generateLink` + `page.goto(action_link)` (rewrite `redirect_to` to `http://localhost:3000/auth/callback`) · Base UI `Switch` = `[data-slot="switch"]` · prod migrations via `migrate-prod.yml` only · `gh run list` after every push · the `rls-requests-isolation` `afterAll` flake is pre-existing, rerun once · `/close-session` to end.

# Next batch — recommended next three items

Rewritten 2026-09-17 after the prior batch fully shipped (PRs #36-39: perf, Phase 4c items 1-2, billing polish B-05/06/07 — all merged, both migrations `0024`/`0025` applied to prod). See `docs/DELIVERY-LOG.md` for detail.

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. PRs #36-39 are all merged and live — no longer a precondition for anything below.
2. Read `docs/DECISIONS.md`. D-06 (ad-hoc notes) is the only tentative decision and is not in this batch.
3. Confirm ship-autonomy for the batch explicitly, per the `/next-batch` skill.

## The three

### 0. Do first — B-25, auth route-allowlist gap (security)

Still open, still first, carried over unchanged from the prior recommendation — nobody picked it up in the 2026-09-15→17 batch since it wasn't one of the 3 confirmed items. `src/lib/supabase/middleware.ts`'s role-based allow-list doesn't cover `/properties`, `/persons`, `/tenancies`, `/requests`, `/notices`, `/meters`, so an authenticated **tenant** session isn't redirected off owner-only pages. See `BACKLOG.md` B-25 for the fix shape (default-deny, explicit per-role allowlist, regression test).

### 1. B-26 — tenant can see draft statements

New finding from the 2026-09-17 session (advisor-flagged, deliberately deferred since it wasn't one of the 3 confirmed items that session). `tenant_scope_statements` RLS has no `status` restriction, and neither tenant statements query (list or detail) filters out `status = 'draft'` — only `voided_at is null`. A tenant can see a draft statement's full detail/PDF before the admin has issued it. Small: two query filters plus tightening the RLS policy itself as the real backstop. See `BACKLOG.md` B-26.

### 2. Phase 4c item 3 — admin statement detail = `design/05`

Natural next step in Phase 4c's own sequencing now that items 1-2 (component tokens, admin dashboard) are shipped. Scope: line items grouped fixed/metered (rate chips, reading deltas)/adjustments, immutability note, payments panel, **delivery log** (email/WhatsApp sends persisted — needs a small schema addition first, so this item likely needs a schema-first sub-step same as B-05 needed migration `0025`), history.

*Done means:* matches `design/05` at 1440, both themes; delivery log shows real sent-email/WhatsApp rows; immutability note is visible on an issued statement.

## Open from the prior batch, not yet resolved

- **Phase 4c items 1-2 (component tokens, admin dashboard) are built and functionally verified on dev, but still await the owner's visual sign-off against `design/01`/`design/04`.** That sign-off — not the code shipping — is Phase 4c's actual Accept gate. Worth doing before piling item 3 on top.
- **B-27** (duplicate `MonthPicker` components, `src/components/month-picker.tsx` vs `src/components/ui/month-picker.tsx`) — tech debt, pick up only if adjacent work touches either one.

## Alternatives if the admin prefers

- **B-01** (domain purchase) and **B-03** (middleware `getClaims()`, needs asymmetric JWT keys enabled by the admin in both Supabase projects) are both admin-action-gated, not pure-code items.
- **B-04** (Sentry) or **B-08** (committed Playwright smoke) if reliability/observability matters more than the security gap or the design pass right now.

## Session logistics (unchanged)

`/verify` for lint + typecheck (build/tests need the DB; CI covers them) · real verification against **dev** with `playwright-owner-emma@flatlord.test` / `playwright-tenant-a@flatlord.test`, login via `auth.admin.generateLink` + `page.goto(action_link)` (rewrite `redirect_to` to `http://localhost:3000/auth/callback`) · Base UI `Switch` = `[data-slot="switch"]` · prod migrations via `migrate-prod.yml` only · `gh run list` after every push · the `rls-requests-isolation` `afterAll` flake is pre-existing, rerun once · SSR hydration-safe client-only reads need `useSyncExternalStore`, not `useState`+`useEffect` (this repo's lint rejects the latter) · don't run `pnpm test` against dev locally, it's CI-only and leaves orphaned fixture rows · `/close-session` to end.

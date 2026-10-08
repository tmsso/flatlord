# Next batch — recommended next three items

Rewritten 2026-10-09 after the 2026-10-08 long batch (PRs #41–#54: security hardening, Phase 4c items 3–5, B-19). See `docs/DELIVERY-LOG.md` for detail.

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. **Prod migrations `0026`–`0028` applied?** `gh run list --workflow migrate-prod.yml --limit 1` must show a run after 2026-10-08. If not, remind the owner before anything else — `0027` closes a live tenant write hole. Never run it yourself (D-14).
2. **Owner visual sign-off on Phase 4c items 1–5** (`design/01`, `04`, `05`, `02`, `03`, `06`). Fold any feedback into this batch ahead of item 2 below.
3. D-24 (post-issue corrections) is **proposed**; if the owner wants an in-place "+ Add adjustment" on issued statements, that is a new item (engine + design), not a tweak.
4. Confirm ship-autonomy for the batch explicitly.

## The three

### 1. B-28 — tenant write policies that don't pin other columns (security, S)

Same class as `0027`, lower stakes: tenant request insert/withdraw can set unrelated columns; `tenant_update_inventory_reconfirmation_items` has no `WITH CHECK`. Pattern and test shape are already in `0027` + `rls-billing-isolation.test.ts`.

### 2. Phase 4c item 6 — remaining `design/09` screens (M–L)

Requests (create / thread / admin queue), notices (compose / tenant acknowledge), approval diff card, inventory grid + reconfirmation, contract version chain + parse review — at token level, plus empty states and loading skeletons. Error pages and admin phone nav are already done (#46, #54). Consider splitting per screen family, one PR each.

### 3. B-08 — committed Playwright smoke (M)

Every batch rewrites the same login helper (`auth.admin.generateLink`, wait for `/home|/dashboard` because the magic link lands on `/login#access_token` and the client redirects). The 2026-10-08 batch's route sweep (both roles × locales, status / overflow / console errors) is exactly the smoke B-08 asks for — commit it with a `workflow_dispatch` + nightly run against **dev**.

## Alternatives

- **B-30** (seed dev with metered history) — small, and makes every chart/metered UI verifiable on dev; good warm-up before item 2.
- **B-04** Sentry; **B-03** `getClaims()` (needs the owner to enable asymmetric JWT keys).

## Session logistics

`/verify` for lint + typecheck · real verification on **dev** (`kqrzqbocruwafvuodatb`) with `playwright-owner-emma@flatlord.test` / `playwright-tenant-a@flatlord.test` · tenant-a's contact email is a real inbox — never trigger real email sends; for send paths start the dev server with an invalid `RESEND_API_KEY` override · format date **ranges** on the server only (`Intl.formatRange` differs between Node and Chromium → hydration mismatch) · Base UI `Select.Value` needs a render-function child · stop dev servers with TaskStop, not `pkill -f` (it matches its own shell) · prod migrations via `migrate-prod.yml` only · `gh run list` after every push · `/close-session` to end.

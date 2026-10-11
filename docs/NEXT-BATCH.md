# Next batch — recommended next three items

Rewritten 2026-10-11 after the long batch from the owner's prod-testing notes (PRs #57–#73, a stacked chain). See `docs/DELIVERY-LOG.md` for detail.

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. **Is the 2026-10-11 chain merged?** `gh pr list` should not show #57–#73. If it does, the owner still has to (a) run `migrate-prod.yml --ref docs/long-batch-2026-10-11` (`0026`–`0031`; `0027` closes a live tenant hole), then (b) run the merge script from that session's handoff. Never do either yourself (D-14, D-30). Don't build on top of unmerged chain branches without saying so.
2. **Prod migrations ran?** `gh run list --workflow migrate-prod.yml --limit 1` must show a run after 2026-10-11. `0029`–`0031` are frozen once prod has them (D-30).
3. **Owner visual sign-off on Phase 4c items 1–6** (`design/01`–`06`, `09`). Fold feedback in first — that is item 1 below.
4. D-24 and D-31 are **proposed**; confirm before touching statements' adjustment flow or inventory `kind`.
5. Confirm ship-autonomy, and find out early whether `gh pr merge` is allowed in the session's mode (it was classifier-blocked on 2026-10-11 → stacked chain).

## The three

### 1. Phase 4c sign-off feedback (S–M)

Whatever the owner flags while comparing screens to the mockups. If nothing, pick **B-41** (reject-with-note) and **B-39** (notice preview / clause picker) — the two design/09 deviations closest to daily use.

### 2. B-12 — migration-drift check (ops, S)

Prod sat three weeks behind on migrations including a security fix (`0027`). A read-only step in `health-check.yml` comparing prod's `drizzle.__drizzle_migrations` count with `supabase/migrations/*.sql` turns that into a red check instead of a memory note.

### 3. B-04 — Sentry free tier (S)

Both users are non-developers; errors still only reach Vercel logs. PII scrubbing for person fields is part of done.

## Alternatives

- **Phase 4b remainder** (yearly comparison, punctuality chart, rate overlay) — now verifiable on dev thanks to B-30's metered history.
- **B-38** if the owner decides D-31 the other way; **B-31** skip-photo reason; **B-11** secondary-query errors.

## Session logistics

`/verify` for lint + typecheck · real verification on **dev** (`kqrzqbocruwafvuodatb`) with `playwright-owner-emma@flatlord.test` / `playwright-tenant-a@flatlord.test` — the committed helper is `tests/e2e/helpers.ts`, the route sweep is `pnpm e2e` · tenant-a's contact email is a real inbox — start servers with an invalid `RESEND_API_KEY` · **long sessions: restart `pnpm dev` when it slows (it reached 2.7 GB on this 3.7 GB node and broke magic-link timing); for sweeps prefer `pnpm build` + `E2E_START_SERVER=1 pnpm e2e`** · Base UI Checkbox ids sit on a hidden input — click the label in Playwright · policies that read their own table → SECURITY DEFINER fn in `private` (D-29) · format date ranges on the server only · stop dev servers with TaskStop, not `pkill -f` · prod migrations via `migrate-prod.yml` only · `gh run list` after every push · `/close-session` to end.

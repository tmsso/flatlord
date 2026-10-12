# Next batch — recommended next three items

Rewritten 2026-10-12 after the owner merged the 2026-10-11 chain (#57–#73), migrated prod (`0026`–`0031`), signed off Phase 4c and decided D-24/D-31. See `docs/DELIVERY-LOG.md` for detail.

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. Nightly `e2e-smoke.yml` is live since 2026-10-12 — check its last run is green before building on `main`. Remaining owner items (`CRON_SECRET`, domain B-01) are long-standing; mention, don't block.
2. Confirm ship-autonomy, and find out early whether `gh pr merge` is allowed in the session's mode (classifier-blocked on 2026-10-11 → stacked chain + owner merge script; allowed again on 2026-10-12 for #74).
3. Any migration in this batch: the owner runs `migrate-prod.yml --ref <top branch>` before merging (D-30).

## The three

### 1. B-38 — facility ↔ item conversion (S)

D-31 decided "convertible" on 2026-10-12. Small and self-contained; lets already-logged appliances move into the facilities group (and the repair picker's Facilities section) without losing photos/history. Probably no migration — the owner-owned CHECK already holds.

### 2. B-45 — switchable modules (M)

Has to come before B-42–B-44: every new module should land behind a switch from day one, and the onboarding wizard needs to know which modules a new owner has on. Needs a migration (per-owner settings); existing owners default to everything on, so prod sees no change.

### 3. B-12 — migration-drift check (ops, S)

Prod sat three weeks behind on migrations including a security fix (`0027`). A read-only step in `health-check.yml` comparing prod's `drizzle.__drizzle_migrations` count with `supabase/migrations/*.sql` turns that into a red check instead of a memory note.

## Alternatives

- **B-04** Sentry (S); **B-41** reject-with-note (S); **B-46** same-day manual backup (S); **B-39** notice preview / clause picker (M).
- **B-44** taxation module (L) — after B-45; reconfirm the Hungarian rules marked "open for build time" in its entry.
- **B-42** onboarding / **B-43** offboarding wizards (L each) — after B-45; B-43 benefits from B-13 and B-14 first.
- **Phase 4b remainder** (yearly comparison, punctuality chart, rate overlay) — verifiable on dev thanks to B-30's metered history.

## Session logistics

`/verify` for lint + typecheck · real verification on **dev** (`kqrzqbocruwafvuodatb`) with `playwright-owner-emma@flatlord.test` / `playwright-tenant-a@flatlord.test` — the committed helper is `tests/e2e/helpers.ts`, the route sweep is `pnpm e2e` · tenant-a's contact email is a real inbox — start servers with an invalid `RESEND_API_KEY` · **long sessions: restart `pnpm dev` when it slows (it reached 2.7 GB on this 3.7 GB node and broke magic-link timing); for sweeps prefer `pnpm build` + `E2E_START_SERVER=1 pnpm e2e`** · Base UI Checkbox ids sit on a hidden input — click the label in Playwright · policies that read their own table → SECURITY DEFINER fn in `private` (D-29) · format date ranges on the server only · stop dev servers with TaskStop, not `pkill -f` · prod migrations via `migrate-prod.yml` only · `gh run list` after every push · `/close-session` to end.

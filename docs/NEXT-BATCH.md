# Next batch — recommended next three items

Rewritten 2026-10-22 at the end of the "own domain + B-51/B-53/B-43" long batch (PRs #95–#97; see `docs/DELIVERY-LOG.md`).

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. B-54: did the owner update Supabase prod Auth URLs for `flatlord.tmsso.com`, and has one real login link reached a non-team inbox? If not, that is the first (5-minute) item.
2. `cron_runs` on prod: any scheduled run not `ok`? That outranks everything below (B-50 needs five consecutive ok runs).
3. D-40, D-44, D-45 confirmed or changed by the owner? A change to D-45 (deposit → payment everywhere) is its own item.
4. Confirm ship-autonomy and whether `gh pr merge` is allowed (it was, 2026-10-22, with the owner's explicit permission for that session).

## The three

### 1. B-03 — proxy without network calls (M)

Every request makes an Auth round-trip plus a `profiles` query, and since B-43 tenants make one more (the "all tenancies ended" lockout check). Move to `getClaims()` + a custom access-token hook carrying `role` (and, for tenants, an "active tenancy" claim refreshed on token refresh). Needs the owner to enable asymmetric JWT signing keys on both Supabase projects first.

### 2. B-52 — meter replacement link (M)

"Retire + add a new meter" works; billing the change month across both meters does not. Read the engine's anchor rules first; golden tests are the contract.

### 3. B-41 — reject-with-note on change requests (S)

Small, self-contained design/09 deviation; pairs well with the two above.

## Alternatives

- **B-04** Sentry (S) — needs the owner to create the Sentry project/DSN first.
- **B-44** taxation module (L, behind the `taxation` switch) — reconfirm the Hungarian rules marked "open for build time".
- **B-13** move-in/out snapshots (M) — replaces the offboarding handover note step.
- **B-49** uninvited Google sign-in hook (S).

## Session logistics

`/verify` for lint + typecheck · DB tests are CI-only (locally they target `localhost:5432` and just fail) · real verification on **dev** (`kqrzqbocruwafvuodatb`) with `tests/e2e/fresh-owner.ts` — a fresh owner has every optional module off (enable via `profiles.enabled_modules`); pass `E2E_DEV_DB_URL` (dev `SUPABASE_DB_URL`) so cleanup can remove issued statements' line items · keep ad-hoc scripts as `tests/e2e/verify-*.local.ts` (git-excluded; note `pnpm build` typechecks them) · stop the local server with `pgrep -f "^next-server" | xargs -r kill` (a plain `pkill -f next` kills your own shell) · start servers with an invalid `RESEND_API_KEY` · `gh run list` after every push · `/close-session` to end.

# Next batch — recommended next three items

Rewritten 2026-11-06 at the end of the "security patch / B-55 / B-49" long batch (PRs #104–#107 + this docs PR, all merged by the session; see `docs/DELIVERY-LOG.md`).

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. Health check green (migration drift, `cron-last-run`), CI on `main` green.
2. Either Auth hook enabled by the owner? If the before-user-created hook is on, an uninvited Google sign-in must land on `/login?error=not_invited` — if it shows `auth_failed`, the real error text differs from the assumed "invitation" (fix in `src/app/auth/callback/route.ts`).
3. D-40, D-44, D-45, D-46, D-48 confirmed or changed?
4. Ask about ship autonomy and merge permission fresh.

## The three

### 1. B-13 — move-in / move-out snapshots (M)

`handover_snapshots` (tenancy/property scoped, `kind` text+CHECK, immutable: no UPDATE policy + explicit GRANTs), inventory + meter baselines as jsonb, photos as references to existing attachment paths, PDF via the `generate-declaration.ts` pattern; tenancy-page section + the offboarding handover step records a move-out snapshot. Tenant reads their own (propose as a decision). RLS test: no foreign-tenancy read.

### 2. B-57 — dashboard misses next-month readings (S)

Follow-up of B-55: the needs-attention queue / stepper should include submitted readings dated after the current month.

### 3. B-11 — `assertNoQueryError` on secondary queries (M)

Mechanical, low risk.

## Alternatives

- **B-04** Sentry (S) — needs the owner's Sentry project/DSN (third-party data, confirm-first).
- **B-44** taxation module (L).

## Session logistics

Unchanged from the previous batch: `/verify`; DB tests are CI-only (except self-cleaning ones); real verification on **dev** (`kqrzqbocruwafvuodatb`) against a local **production build** — check `.next/BUILD_ID`'s time, and start `next start` only *after* the build finishes; scripts that import `server-only` modules need `NODE_OPTIONS=--conditions=react-server`; `tests/e2e/verify-*.local.ts` are git-excluded; stop the server with `pgrep -f "^next-server" | xargs -r kill`; `gh run list` after every push.

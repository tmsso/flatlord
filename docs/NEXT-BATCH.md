# Next batch — recommended next three items

Rewritten 2026-10-23 at the end of the "B-41 / B-52 / B-03" long batch (PRs #99–#101 + this docs PR, a stacked chain merged by the owner; see `docs/DELIVERY-LOG.md`).

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. Is the 2026-10-23 chain merged (#99 → #100 → #101 → docs) and is prod at `0037`? If not, remind the owner — don't build on the chain's branches.
2. Access-token hook enabled on dev (and prod)? It is optional (D-47). If enabled, re-run `tests/e2e/verify-b03.local.ts` (git-excluded, exists only on the owner's machine) and expect a `user_role` claim.
3. `cron_runs` on prod: any scheduled run not `ok`? That outranks everything below (B-50 needs five consecutive ok runs).
4. B-54 real send, D-40, D-44, D-45, D-46 confirmed or changed by the owner?
5. Ask about ship autonomy and whether `gh pr merge` is allowed (classifier-blocked on 2026-10-23; allowed on 2026-10-22).

## The three

### 1. B-55 — readings dated in a billed month (S–M)

Billing correctness gap found while building B-52: a reading dated inside an already-drafted/issued month is never billed. Decide refuse-at-entry vs carry-forward first (a short decision note for the owner); golden tests are the contract.

### 2. B-13 — move-in / move-out snapshots (M)

Replaces the offboarding wizard's handover *note* step (B-43) with a real snapshot: inventory state + meter baselines + photos, PDF via the existing template pattern.

### 3. B-49 — uninvited Google sign-in hook (S)

A "before user created" Auth hook that checks for a live invite, so an uninvited Google account never gets an `auth.users` row. Same mechanics as 0037's access-token hook (SQL function, `supabase_auth_admin` grants, owner enables it in the dashboard).

## Alternatives

- **B-04** Sentry (S) — needs the owner to create the Sentry project/DSN first; sends error data to a third party (confirm-first).
- **B-44** taxation module (L, behind the `taxation` switch) — reconfirm the Hungarian rules marked "open for build time".
- **B-11** `assertNoQueryError` on secondary queries (M) — mechanical, low risk.

## Session logistics

`/verify` for lint + typecheck · DB tests are CI-only · real verification on **dev** (`kqrzqbocruwafvuodatb`) against a local **production build** (`pnpm build && pnpm exec next start`; `next dev` hung compiling routes on this node) — after a build check `.next/BUILD_ID`'s time, since a failed build leaves the old one being served · `tests/e2e/fresh-owner.ts` for a brand-new owner (modules off; pass `E2E_DEV_DB_URL` = dev `SUPABASE_DB_URL` for cleanup) · ad-hoc scripts as `tests/e2e/verify-*.local.ts` (git-excluded; `pnpm build` typechecks them; `verify-b43` drops PNGs in the repo root) · stop the server with `pgrep -f "^next-server" | xargs -r kill` · start servers with an invalid `RESEND_API_KEY` · `gh run list` after every push · `/close-session` to end.

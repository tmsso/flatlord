# Next batch — recommended next three items

Rewritten 2026-10-12 at the end of the "ready for a second owner" long batch (stacked chain #75 → #82, **open**; `0032`–`0034` applied on dev only). See `docs/DELIVERY-LOG.md`.

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. **Is the 2026-10-12 chain merged and prod migrated to `0034`?** (`gh pr list`, the `migration-drift` job in `health-check.yml`.) If not, remind the owner — everything below builds on it. Don't stack new work on an unmerged chain unless the owner says so.
2. Nightly `e2e-smoke.yml` green on `main`.
3. Confirm ship-autonomy; check early whether `gh pr merge` is allowed (blocked 2026-10-11, allowed for #74, not tried 2026-10-12).
4. Any migration: the owner runs `migrate-prod.yml --ref <top branch>` before merging (D-30).

## The three

### 1. B-47 — ownership bootstrap claim (S)

The last owner-isolation hole known: any owner can add the first ownership row to an unowned root property. Small, and it should land before a second owner is actually invited.

### 2. B-42 — onboarding wizard (L)

Unblocked by this batch: owners are isolated (D-34), modules are switchable with everything-off defaults (D-37), and an invited owner now gets a bare person record (D-38) — the wizard's first step ("own personal data") replaces that stopgap's naming. Compose the existing create forms; resumable from DB state, no wizard table.

### 3. B-48 — module loose ends (S)

Dashboard queue / counters still show requests with the module off; decide what inventory discrepancies do then.

## Alternatives

- **B-44** taxation module (L) — behind the `taxation` switch (reserved in `0033`); reconfirm the Hungarian rules marked "open for build time".
- **B-04** Sentry (S, needs the owner's DSN); **B-41** reject-with-note (S); **B-49** uninvited Google sign-in hook (S).
- **B-43** offboarding wizard (L) — benefits from B-13 and B-14 first.

## Session logistics

`/verify` for lint + typecheck · DB tests are CI-only · real verification on **dev** (`kqrzqbocruwafvuodatb`) with `playwright-owner-emma@flatlord.test` / `playwright-tenant-a@flatlord.test`; a *fresh* owner can be made through the real path (Emma → Settings → owner invite → `auth.admin.createUser`) · start servers with an invalid `RESEND_API_KEY` (tenant-a's contact email is real) · prefer `pnpm build` + `pnpm start` over `pnpm dev` on this node; stop it with TaskStop · Base UI Switch/Checkbox ids sit on a hidden input — click `label[for=…]` · assert on role-scoped locators, not page HTML (RSC payloads contain off-screen data — a false pass happened) · policies that read their own table → SECURITY DEFINER fn in `private` (D-29) · `gh run list` after every push · `/close-session` to end.

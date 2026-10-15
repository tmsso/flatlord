# Next batch — recommended next three items

Rewritten 2026-10-15 at the end of the "second owner can set up a flat + tenant" long batch (PRs #84–#91; see `docs/DELIVERY-LOG.md`).

**Valid while** `git log -1 --format=%h -- ROADMAP.md` equals `git log -1 --format=%h -- docs/NEXT-BATCH.md` (both changed in the same commit). If they differ, the roadmap moved on — re-derive from `ROADMAP.md` + `BACKLOG.md` instead of trusting this file, and say so.

## Preconditions to check first

1. Are `0035`–`0036` on prod and #85 → #86 merged? (`gh pr list`; the health check's `migration-drift` job says how far prod is behind.) If not, remind the owner — don't build on top of the open branches.
2. B-54: did the owner confirm how sign-in email reaches a non-team address on prod? It decides whether the wizard is usable by a real second owner yet.
3. `cron_runs` (once `0036` is on prod): any scheduled run not `ok`? That outranks everything below (B-50).
4. Confirm ship-autonomy and whether `gh pr merge` is allowed (it was, 2026-10-15, with the owner's explicit permission for that session).

## The three

### 1. B-51 — more than one tenancy per owner in the UI (M)

The wizard can now create a second tenancy, but the statements page drafts only for `tenancies[0]` and the dashboard shows one tenancy. A tenancy picker on both, before any owner actually runs two.

### 2. B-53 — return error codes instead of throwing (S)

Older forms show `err.message`, which production builds redact. Move the remaining owner-facing actions to the `{ ok:false, error }` pattern the billing-setup and tenant-invite actions use.

### 3. B-43 — offboarding wizard (L)

The mirror of B-42 (final readings, final statement, deposit settlement, handover, end access). Reuse the `/onboarding` pattern: steps derived from DB state, composed of existing components. B-13 (move-out snapshot) can ship as a "manual note" step first.

## Alternatives

- **B-44** taxation module (L, behind the `taxation` switch) — reconfirm the Hungarian rules marked "open for build time".
- **B-52** meter replacement link (M; golden tests are the contract). **B-41** reject-with-note (S). **B-49** uninvited Google sign-in hook (S — the hook also fires on admin `createUser`; design for the invite path and RLS tests).

## Session logistics

`/verify` for lint + typecheck · DB tests are CI-only · real verification on **dev** (`kqrzqbocruwafvuodatb`): a fresh owner through the real path is `invites` row → `auth.admin.createUser` → `handle_new_user` (a reusable fixture + cleanup lived in the 2026-10-15 session's scratch `pw/fixtures.ts`; the pattern is in that batch's memory) · start servers with an invalid `RESEND_API_KEY` · prefer `pnpm build` + `pnpm start` on this node · Base UI `Button` rendering a `Link` has role **button** in Playwright · admin `notFound()` renders the 404 UI with HTTP 200 (`(admin)/loading.tsx` streams) — assert on the heading · `audit_log`'s timestamp column is `at` · thrown server-action messages are redacted in prod builds — return codes · `gh run list` after every push · `/close-session` to end.

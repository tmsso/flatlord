# Self-host escape hatch

Continuation of the data-ownership story in CLAUDE.md §3.10: the free-tier stack has no
guaranteed retention, so [backup-restore.md](./backup-restore.md) covers getting the data
*out*. This doc covers where it can go if Supabase itself ever needs to be left — either
self-hosting Supabase's own open-source stack, or migrating off Supabase entirely.

This is a reference for a real migration, not something to spin up casually — a full
self-hosted Supabase stack is a heavy multi-container deployment (Postgres, GoTrue, Storage
API, Realtime, Studio, Kong, …), unsuitable for this project's resource-constrained dev
machine. Any actual run of this procedure targets a real server (a VPS or similar), not
local development.

## What's portable, and what isn't

This app talks to Supabase through three services, each with a different migration cost:

| Service | Used for | Self-host difficulty |
|---|---|---|
| Postgres | all domain data, via Drizzle | Trivial — it's just Postgres. `schema.sql` + `data.sql` from the nightly backup restore into any Postgres 15+ target. |
| Auth (GoTrue) | login (Google OAuth + magic link, invite-only, no passwords) | Moderate if self-hosting Supabase's own GoTrue; harder if leaving Supabase Auth for a different provider (see below). |
| Storage | contract/attachment/meter-photo/inventory files | Moderate — Supabase Storage is its own open-source service (S3-compatible internally); either self-host it or swap the app's Storage calls for a different S3-compatible SDK. |

RLS policies and the schema itself are plain Postgres — they carry over to any Postgres
target with no changes, since they're not a Supabase-specific feature.

## Option A: self-host the Supabase stack (recommended escape hatch)

Supabase publishes an official self-hosted distribution (`docker-compose`, all the same
services this app already depends on: Postgres, GoTrue, Storage API, Kong, Realtime). This
is the lowest-effort path because the app's code doesn't change — `supabase-js` and Drizzle
both just point at a different URL and keys, the same way `dev` vs `prod` already work today.

1. Stand up the self-hosted stack on a real server, following Supabase's own
   self-hosting docs for the current release.
2. Apply this repo's migrations against it (`pnpm exec tsx src/db/migrate.ts`) — recreates
   schema, RLS policies, and Storage buckets from source, same as
   [backup-restore.md](./backup-restore.md)'s "Full disaster recovery" section.
3. Restore `data.sql` and `auth.sql` from the latest nightly backup — same restore
   procedure as the existing disaster-recovery path, just against a self-hosted target
   instead of a new hosted Supabase project. The same auth-schema-drift caveat documented
   there applies: verify `auth.sql` actually applies cleanly against the self-hosted
   GoTrue's schema version before relying on it, and re-inviting the (small, invite-only)
   user set is always the fallback.
4. Restore Storage files (`supabase storage cp -r`, same command as today, pointed at the
   self-hosted project).
5. Re-point Vercel env vars (`NEXT_PUBLIC_SUPABASE_URL`, keys, `SUPABASE_DB_URL`) at the
   self-hosted stack's endpoints.

## Option B: leave the Supabase ecosystem entirely

A bigger lift, only relevant if Option A's self-hosted Supabase stack itself becomes
undesirable (not just the hosted free tier):

- **Postgres**: unchanged — any Postgres 15+ host works, including a plain managed
  Postgres instance with no Supabase involvement at all.
- **Auth**: this app has no passwords to migrate (OAuth + magic link only), which removes
  the usual hardest part of an auth migration. What's still real work: re-registering the
  Google OAuth app against a new auth provider, and replacing `supabase-js`'s auth calls
  with that provider's SDK — RLS's `auth.uid()` pattern is Supabase-specific, so
  self-rolled auth also means reworking the RLS policies to whatever the new provider's
  session/JWT claims look like.
- **Storage**: swap the buckets for any S3-compatible provider and replace
  `supabase-js`'s Storage calls with that provider's SDK (or a generic S3 client) — the
  files themselves are portable via the same `storage cp` export used in backups.

Not scoped further here — genuinely relevant only if Option A stops being viable, at which
point it's its own real design pass, not a checklist.

## Relationship to the nightly backup

Nothing above needs a new export mechanism — [backup-restore.md](./backup-restore.md)'s
existing nightly artifacts (`schema.sql`, `data.sql`, `auth.sql`, `storage/`) are the same
inputs either path restores from. This doc only adds *where* those artifacts can land
besides "a new hosted Supabase project," which is the only target the existing doc
currently describes.

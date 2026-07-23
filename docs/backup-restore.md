# Backup & restore

Nightly automated backup, per CLAUDE.md §3.10. This complements (does not replace) the in-app export in the admin UI, which excludes `auth.users` entirely — this backup is the more complete of the two.

## What gets backed up

`.github/workflows/backup.yml` runs `scripts/backup-prod.sh` nightly at 02:17 UTC (and on-demand via `workflow_dispatch`), against **flatlord-prod only**. Each run produces one `.tar.gz`, published as a **GitHub Release** on the private `tmsso/flatlord-backups` repo, tagged `backup-YYYY-MM-DD`:

- `schema.sql` — full `public` + `drizzle` schema DDL (`supabase db dump`)
- `data.sql` — data from `public` + `drizzle` schemas only, as `COPY` statements — the restore-tested, reliable artifact (see below)
- `auth.sql` — data from the `auth` schema, kept as a **separate file deliberately** (see caveat below) so a restore of `data.sql` never fails partway through because of it
- `storage/` — full file contents of every Supabase Storage bucket (`supabase storage cp -r`)

Releases are used instead of committed files specifically so retention actually reclaims space: a `git`-committed-and-later-deleted file still lives forever in the repo's history, but a deleted Release + its asset is genuinely gone. Releases older than 30 days are deleted automatically at the end of each run.

**Why `storage.*` schema data is excluded from `data.sql`**: Supabase Storage's own tables (`storage.objects` etc.) are owned by the Storage API, not directly writable via SQL (`DELETE`/`INSERT` from `psql` is rejected outright). Bucket file contents are captured separately via `storage cp` instead — restoring by re-uploading files through the Storage API is the correct mechanism, and repopulates the metadata rows naturally.

**Auth data caveat**: `auth.sql` (all `auth` schema data, not just users/identities) is captured on a best-effort basis, in its own file specifically so it can't break a restore of the reliable `data.sql`. Supabase's hosted `auth` schema evolves ahead of any self-hosted Postgres image's bundled schema (confirmed during restore testing below — a bare `supabase/postgres` container only bakes in a 7-migration legacy baseline, missing columns and tables that prod's live schema has). A restore into an arbitrary self-hosted Postgres target is **not guaranteed to succeed for auth data**. The real disaster-recovery target is a **fresh Supabase project** (same platform, schema matches or exceeds prod) — see below. For this app's two invite-only users (OAuth/magic-link, no passwords), re-inviting is a trivial fallback regardless of whether `auth.sql` restores cleanly.

## Restore procedure

### App data (`public` + `drizzle` schemas) — tested, reliable

This is the procedure actually validated end-to-end on 2026-07-23 (see below): schema + data restored with **exact row-count parity across all 18 tables**.

1. Download and extract the release asset:
   ```
   gh release download backup-YYYY-MM-DD --repo tmsso/flatlord-backups
   tar -xzf backup-YYYY-MM-DD.tar.gz
   ```
2. Stand up a target Postgres — either a fresh Supabase project (real DR path) or, for a quick data-integrity check, a throwaway container:
   ```
   docker run -d --name flatlord-restore -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.143
   ```
3. Apply the schema, then `data.sql` (schema first — `data.sql` is `COPY`-only, no `CREATE TABLE`):
   ```
   docker cp schema.sql flatlord-restore:/tmp/schema.sql
   docker cp data.sql flatlord-restore:/tmp/data.sql
   docker exec flatlord-restore psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/schema.sql
   docker exec flatlord-restore psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/data.sql
   ```
   Both should complete with no errors — this is the reliable, restore-tested path (see below). `auth.sql` is intentionally separate and is **not** part of this bare-container flow — see the auth caveat above. Only load `auth.sql` when the target is a real Supabase project (§ Full disaster recovery below).
4. Verify: row counts should match the source project exactly (spot-check a few tables via `select count(*) from public.<table>`).

### Storage files

```
supabase storage cp -r storage/<bucket> ss:///<bucket> --linked --experimental
```
against the target project (real Supabase project — buckets/policies must already exist there, e.g. via `pnpm exec tsx src/db/migrate.ts` applying this repo's migrations first). Uploading through the Storage API naturally repopulates `storage.objects` metadata — no manual data restore needed for that schema.

### Full disaster recovery (new Supabase project)

1. Create a new Supabase project, link it, run `pnpm exec tsx src/db/migrate.ts` against it — recreates schema, Storage buckets, and RLS policies from this repo's migrations (the actual source of truth, not the dump).
2. Restore `data.sql`, then `auth.sql` against it — since it's a real Supabase project, `auth.*` tables already exist and should match (same hosted platform), unlike the bare-container path above.
3. Restore Storage files per above.
4. Re-point `SUPABASE_DB_URL`/`NEXT_PUBLIC_SUPABASE_URL`/etc. (Vercel env vars) at the new project.

## Restore test performed

Validated 2026-07-23 against a real prod dump (flatlord-prod, `zarpjgtcwkndtmlnhmdd`):

- `schema.sql` (public+drizzle DDL) applied cleanly to a fresh `supabase/postgres:17.6.1.143` container.
- `data.sql` scoped to `public`+`drizzle` (auth excluded from this particular test run) restored cleanly.
- All 18 `public` tables verified with **exact row-count match** against the source (`properties`, `charge_types`, `persons`, `tenancies`, `adjustments`, `audit_log`, `charge_schedules`, `field_policies`, `field_requirements`, `invites`, `meters`, `meter_readings`, `statements`, `payments`, `profiles`, `property_ownership`, `statement_line_items`, `tenancy_occupants`).
- `storage cp` round-trip (upload → list → download → delete) verified against the real `meter-photos` bucket on prod, with a real image file. **Caveat**: the bucket was empty at the time of the full pipeline run, so `scripts/backup-prod.sh`'s `storage/<bucket>` layout is only confirmed against an empty bucket (produces a nested `storage/<bucket>/<bucket>/` — harmless, files aren't lost, just one level deeper than the doc above implies). Re-verify the exact path layout once real meter photos exist.
- Full pipeline (`scripts/backup-prod.sh`) run end-to-end once manually: dump, storage sync, bundle, publish to `tmsso/flatlord-backups` as a Release, verified asset contents, pruned the test release afterward.
- **Prune-delete path** exercised directly with a throwaway release + `RETENTION_DAYS=0`: confirmed it correctly selects and deletes an old release+tag while leaving a fresh one alone.
- **Real cross-repo PAT path**: a genuine `workflow_dispatch` run (2026-07-23, run `30000474421`) completed green using the actual narrow `BACKUP_REPO_TOKEN` fine-grained PAT (Contents: read/write, scoped only to `flatlord-backups`) — not the admin's broad credentials. That run's release (`backup-2026-07-23`) is a real backup, kept (not a test artifact). This caught a real bug first: the CLI's `storage ls` output format differs between an interactive dev shell (silently JSON, cause not fully root-caused — likely agent-context auto-detection) and a clean/CI environment (plain text, the CLI's actual documented default) — fixed by passing `--output-format json` explicitly rather than relying on the ambient default.
- `auth.*` restore into a bare container was attempted and found to fail on schema drift (documented above as the known caveat) — not a bug in the backup, a structural limitation of self-hosted restore targets. This is why `auth.sql` is now a separate file from `data.sql`.
- Containers torn down immediately after each test; nothing persisted outside the throwaway container.

## Required secrets (`tmsso/flatlord` repo settings)

| Secret | Purpose |
|---|---|
| `SUPABASE_DB_URL_PROD` | prod Postgres connection string (session-mode pooler, port 5432) |
| `SUPABASE_ACCESS_TOKEN` | Supabase management API token, used for `storage cp`/`link` |
| `BACKUP_REPO_TOKEN` | fine-grained GitHub PAT, scoped to `tmsso/flatlord-backups` only, with **Contents: Read and write** permission (covers Releases) — needed because the default `GITHUB_TOKEN` can't push to a different repo |

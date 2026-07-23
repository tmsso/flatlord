#!/usr/bin/env bash
# Nightly prod backup: DB schema + data dump, Storage bucket file sync,
# bundled and pushed as a GitHub Release asset on the private
# tmsso/flatlord-backups repo. Run from .github/workflows/backup.yml.
#
# Required env: SUPABASE_DB_URL_PROD, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF,
# BACKUP_REPO_TOKEN, BACKUP_REPO (owner/name), RETENTION_DAYS.
set -euo pipefail

: "${SUPABASE_DB_URL_PROD:?missing}"
: "${SUPABASE_ACCESS_TOKEN:?missing}"
: "${SUPABASE_PROJECT_REF:?missing}"
: "${BACKUP_REPO_TOKEN:?missing}"
: "${BACKUP_REPO:?missing}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "== Linking to prod project =="
supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo "== Dumping schema (public + drizzle) =="
supabase db dump --db-url "$SUPABASE_DB_URL_PROD" -f "$WORKDIR/schema.sql"

# Two separate data files, deliberately: data.sql (public+drizzle) is the
# reliable, restore-tested artifact -- always loads cleanly against schema.sql.
# auth.sql is best-effort: Supabase's hosted auth schema evolves ahead of any
# self-hosted image, so it is not guaranteed to restore byte-for-byte into an
# arbitrary Postgres target (confirmed during restore testing -- see
# docs/backup-restore.md). Keeping it separate means a restore into a
# throwaway/bare target can apply data.sql with ON_ERROR_STOP=1 and simply
# skip auth.sql, rather than the whole load dying partway through. storage.*
# data is excluded from both -- Storage objects are owned by the Storage API,
# not restorable via raw SQL; bucket file contents are captured separately
# below via `storage cp` instead.
echo "== Dumping data (public + drizzle) =="
supabase db dump --db-url "$SUPABASE_DB_URL_PROD" --data-only --use-copy \
  --schema public,drizzle -f "$WORKDIR/data.sql"

echo "== Dumping data (auth, best-effort) =="
supabase db dump --db-url "$SUPABASE_DB_URL_PROD" --data-only --use-copy \
  --schema auth -f "$WORKDIR/auth.sql"

echo "== Syncing Storage buckets =="
mkdir -p "$WORKDIR/storage"
STORAGE_LS_RAW="$(supabase storage ls --linked --experimental)"
echo "storage ls raw output: $STORAGE_LS_RAW"
BUCKETS=$(echo "$STORAGE_LS_RAW" | python3 -c "import json,sys; print('\n'.join(p.strip('/') for p in json.load(sys.stdin)['paths']))")
if [ -z "$BUCKETS" ]; then
  echo "no buckets found"
else
  for bucket in $BUCKETS; do
    echo "  syncing bucket: $bucket"
    supabase storage cp -r "ss:///${bucket}" "$WORKDIR/storage" --linked --experimental || true
  done
fi

echo "== Bundling archive =="
STAMP="$(date -u +%Y-%m-%d)"
ARCHIVE="$WORKDIR/backup-${STAMP}.tar.gz"
tar -czf "$ARCHIVE" -C "$WORKDIR" schema.sql data.sql auth.sql storage

echo "== Publishing release to $BACKUP_REPO =="
export GH_TOKEN="$BACKUP_REPO_TOKEN"
gh release create "backup-${STAMP}" "$ARCHIVE" \
  --repo "$BACKUP_REPO" \
  --title "Backup ${STAMP}" \
  --notes "Automated nightly backup of flatlord-prod (schema + data + storage). See docs/backup-restore.md in tmsso/flatlord for the restore procedure." \
  --latest=false

echo "== Pruning releases older than ${RETENTION_DAYS} days =="
CUTOFF_EPOCH=$(date -u -d "-${RETENTION_DAYS} days" +%s)
gh release list --repo "$BACKUP_REPO" --limit 200 --json tagName,publishedAt \
  | python3 -c "
import json, sys
cutoff = $CUTOFF_EPOCH
for r in json.load(sys.stdin):
    if not r['tagName'].startswith('backup-'):
        continue
    from datetime import datetime, timezone
    published = datetime.fromisoformat(r['publishedAt'].replace('Z', '+00:00')).timestamp()
    if published < cutoff:
        print(r['tagName'])
" | while read -r tag; do
    echo "  deleting old release: $tag"
    gh release delete "$tag" --repo "$BACKUP_REPO" --yes --cleanup-tag
  done

echo "== Done =="

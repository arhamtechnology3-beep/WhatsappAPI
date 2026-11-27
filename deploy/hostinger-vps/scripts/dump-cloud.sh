#!/usr/bin/env bash
# Dump Supabase Cloud Postgres for restore onto Hostinger VPS.
#
# Required env:
#   CLOUD_DATABASE_URL  — Session pooler or direct URI from
#                         Supabase Dashboard → Project Settings → Database
#                         (use the URI that allows pg_dump; prefer direct
#                         or session mode, not transaction pooler).
#
# Optional:
#   DUMP_FILE  — output path (default ./wacrm-cloud-$(date).dump)
#
# Example:
#   export CLOUD_DATABASE_URL='postgresql://postgres.…@db.….supabase.co:5432/postgres'
#   ./deploy/hostinger-vps/scripts/dump-cloud.sh
set -euo pipefail

if [[ -z "${CLOUD_DATABASE_URL:-}" ]]; then
  echo "Set CLOUD_DATABASE_URL to the Supabase Cloud Postgres URI." >&2
  exit 1
fi

OUT="${DUMP_FILE:-./wacrm-cloud-$(date -u +%Y%m%dT%H%M%SZ).dump}"

echo "Dumping Cloud → ${OUT}"
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --exclude-schema=supabase_functions \
  --exclude-schema=_realtime \
  --dbname="$CLOUD_DATABASE_URL" \
  --file="$OUT"

echo "Done. Size: $(du -h "$OUT" | awk '{print $1}')"
echo "Next: copy to VPS and run restore-vps.sh"

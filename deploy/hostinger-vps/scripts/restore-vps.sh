#!/usr/bin/env bash
# Restore a Cloud pg_dump into Hostinger VPS Postgres (self-hosted Supabase).
#
# Required env:
#   VPS_DATABASE_URL  — Postgres URI on the VPS (usually localhost inside VPS,
#                       e.g. postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres)
#   DUMP_FILE         — path to the .dump from dump-cloud.sh
#
# Run this ON the VPS (or with SSH tunnel). Stop the Node cron / app traffic
# during restore if possible.
#
# Example (on VPS):
#   export VPS_DATABASE_URL='postgresql://postgres:…@127.0.0.1:5432/postgres'
#   export DUMP_FILE=./wacrm-cloud-….dump
#   ./restore-vps.sh
set -euo pipefail

if [[ -z "${VPS_DATABASE_URL:-}" ]]; then
  echo "Set VPS_DATABASE_URL." >&2
  exit 1
fi
if [[ -z "${DUMP_FILE:-}" || ! -f "$DUMP_FILE" ]]; then
  echo "Set DUMP_FILE to an existing .dump file." >&2
  exit 1
fi

echo "WARNING: This overwrites overlapping schemas/tables on the VPS DB."
echo "Dump: $DUMP_FILE"
echo "Target: $VPS_DATABASE_URL"
read -r -p "Type YES to continue: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Aborted."
  exit 1
fi

# Prefer restore into public + auth. Hostinger template already has auth schema;
# --clean drops objects that exist in the dump before recreate.
pg_restore \
  --verbose \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --dbname="$VPS_DATABASE_URL" \
  "$DUMP_FILE" || {
    echo "pg_restore exited non-zero (often OK for extension/role noise)." >&2
    echo "Verify row counts in Studio before cutover." >&2
  }

echo "Restore finished. Check Studio → Table Editor (contacts, conversations, messages)."
echo "Then update Hostinger Node env (see env/node-app.env.example) and restart Node."

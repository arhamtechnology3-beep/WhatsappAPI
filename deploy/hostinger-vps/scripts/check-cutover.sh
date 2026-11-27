#!/usr/bin/env bash
# Quick health checks after pointing Node at the VPS backend.
#
# Usage:
#   NEXT_PUBLIC_SUPABASE_URL=https://db.example.com \
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
#   APP_URL=https://whatsapp.arhamtechnology.com \
#   ./deploy/hostinger-vps/scripts/check-cutover.sh
set -euo pipefail

URL="${NEXT_PUBLIC_SUPABASE_URL:?Set NEXT_PUBLIC_SUPABASE_URL}"
ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:?Set NEXT_PUBLIC_SUPABASE_ANON_KEY}"
APP="${APP_URL:-https://whatsapp.arhamtechnology.com}"

echo "== Auth health on backend =="
code=$(curl -sS -o /tmp/sb-health.json -w "%{http_code}" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${ANON}" \
  "${URL}/auth/v1/health" || true)
echo "HTTP $code"
head -c 300 /tmp/sb-health.json 2>/dev/null || true
echo

if echo "$URL" | grep -q 'supabase\.co'; then
  echo "NOTE: URL still points at supabase.co (Cloud). Cutover not done."
else
  echo "URL is not supabase.co — looks like self-host / VPS."
fi

echo
echo "== App health =="
curl -sS "${APP}/api/health" || true
echo
echo "Open ${APP}/login and sign in to finish verification."

#!/usr/bin/env bash
# Run in Hostinger Advanced → SSH / Terminal (account home).
# Safe defaults: dry-run unless you pass --apply.
set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

HOME_DIR="${HOME:-.}"
echo "== Hostinger cleanup (NPROC / disk) =="
echo "Home: $HOME_DIR"
echo

echo "-- Process count (informational) --"
ps -e --no-headers 2>/dev/null | wc -l || true
echo

FFMPEG_CACHE="$HOME_DIR/.cache/ffmpeg-static-nodejs"
if [[ -d "$FFMPEG_CACHE" ]]; then
  SIZE=$(du -sh "$FFMPEG_CACHE" 2>/dev/null | awk '{print $1}')
  echo "-- ffmpeg cache: $FFMPEG_CACHE ($SIZE) --"
  if [[ "$APPLY" -eq 1 ]]; then
    rm -rf "$FFMPEG_CACHE"
    echo "Deleted $FFMPEG_CACHE"
  else
    echo "Dry-run. Re-run with --apply to delete."
  fi
else
  echo "-- ffmpeg cache: not found --"
fi
echo

HBUILDS="$HOME_DIR/hbuilds"
if [[ -d "$HBUILDS" ]]; then
  echo "-- hbuilds top-level --"
  du -sh "$HBUILDS"/* 2>/dev/null | sort -h | tail -20 || true
  echo
  echo "Do NOT auto-delete hbuilds here — remove old versions only via"
  echo "hPanel Deployments UI so the live build is not removed."
else
  echo "-- hbuilds: not found at $HBUILDS --"
fi

echo
if [[ "$APPLY" -eq 0 ]]; then
  echo "Done (dry-run). Apply ffmpeg cleanup with:"
  echo "  bash scripts/hostinger-cleanup.sh --apply"
fi

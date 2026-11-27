# Hostinger VPS — self-hosted backend for wacrm

Full guide: [`docs/hostinger-selfhost-supabase.md`](../../docs/hostinger-selfhost-supabase.md)

## Quick path

1. Order **Hostinger VPS** with template **Ubuntu 22.04 + Supabase** ([plans](https://www.hostinger.com/vps/supabase-hosting)). Use **KVM 2+**.
2. Finish Hostinger’s [Supabase template setup](https://support.hostinger.com/en/articles/9956903-how-to-use-the-supabase-vps-template).
3. Dump Cloud → restore VPS with scripts in `scripts/`.
4. Update Node env on the existing Hostinger website to the VPS URL + keys.
5. Restart Node → login + inbox smoke test.

## Files

| Path | Purpose |
| --- | --- |
| `env/node-app.env.example` | Env vars to paste into Hostinger Node after cutover |
| `scripts/dump-cloud.sh` | `pg_dump` from Supabase Cloud |
| `scripts/restore-vps.sh` | Restore dump into VPS Postgres |
| `scripts/check-cutover.sh` | Hit Auth health on the new URL |

## Prefer Hostinger’s template over hand-rolled compose

Hostinger’s marketplace image already wires Kong, GoTrue, PostgREST, Realtime, Storage, Studio. Replicating that by hand is error-prone; use their template, then run our dump/restore + Node env switch.

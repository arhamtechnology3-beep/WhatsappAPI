# Move off Supabase Cloud → Hostinger VPS (self-hosted)

## Why this path

- The CRM app already runs on **Hostinger Node**.
- Login / DB / Realtime / Storage still hit **Supabase Cloud** (`*.supabase.co`).
- Cloud blocked you with `exceed_egress_quota` — that is a **billing/quota** lock, not an app bug.
- Hostinger **shared / Business Node** only includes **MySQL**. This app needs **Postgres + Auth + Realtime + Storage** (69+ migrations, RLS, inbox realtime). A MySQL rewrite is a multi-month rebuild.
- **Correct Hostinger-only path:** keep the Node app on current hosting, put the backend on a **Hostinger VPS with the official Supabase template**. Traffic stays on Hostinger; you no longer depend on supabase.com quotas.

```
Browser → whatsapp.arhamtechnology.com (Hostinger Node)
                ↓
         YOUR VPS (self-hosted Supabase: Postgres + Auth + Realtime + Storage)
```

## What you (owner) must buy / click

I cannot order a VPS or touch your billing from this agent.

1. Open [Hostinger Supabase VPS](https://www.hostinger.com/vps/supabase-hosting).
2. Choose at least **KVM 2** (8 GB RAM) — KVM 1 is tight for Supabase + Realtime.
3. Region: **India / Asia** (closest to Mumbai traffic).
4. OS template: **Ubuntu 22.04 64bit with Supabase** (pre-installed).
5. After provisioning, follow Hostinger’s guide:  
   [How to use the Supabase VPS template](https://support.hostinger.com/en/articles/9956903-how-to-use-the-supabase-vps-template).
6. Note from the VPS panel / Studio:
   - API URL (e.g. `https://supabase.<your-vps-domain>` or `http://VPS_IP:8000`)
   - `anon` key
   - `service_role` key
7. Put HTTPS in front (Hostinger panel SSL or Caddy/Nginx on the VPS). The CRM expects `https://…`.

## Temporary unblock (optional)

While the VPS is provisioning, restore login on Cloud by removing the spend cap / upgrading in [Supabase Dashboard → Billing](https://supabase.com/dashboard). That is only a bridge so staff can work.

## Migrate data (Cloud → VPS)

On a laptop with network access to **both** Cloud and the VPS (or run dump on Cloud SQL editor + restore on VPS):

```bash
# 1) Dump from Supabase Cloud (Database settings → connection string)
./deploy/hostinger-vps/scripts/dump-cloud.sh

# 2) Copy dump to VPS and restore
./deploy/hostinger-vps/scripts/restore-vps.sh
```

See script headers for required env vars. Prefer a maintenance window (cron off, no broadcasts).

After restore:

- Confirm Studio login on the VPS.
- Spot-check tables: `contacts`, `conversations`, `messages`, `accounts`, `auth.users`.
- Re-upload or sync Storage buckets if media URLs still point at `*.supabase.co` (see Storage section below).

## Point the Hostinger Node app at the VPS

In hPanel → WhatsApp Node app → **Environment variables**, replace Cloud values:

| Variable | New value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-vps-supabase-host>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | VPS `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | VPS `service_role` key |

Keep all other secrets (`ENCRYPTION_KEY`, Meta, Shopify, cron) unchanged.

Then **Restart** the Node app.

Smoke test:

1. `https://whatsapp.arhamtechnology.com/login` — sign in.
2. Inbox loads + realtime updates.
3. Send a test WhatsApp reply.
4. `curl -fsSL "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=…"` returns jobs (not Auth/DB errors).

## Storage / media

Chat media and avatars live in Supabase Storage. After DB restore:

1. In VPS Studio → Storage, recreate buckets used in migrations (`avatars`, chat media, etc.) with the same public/private flags.
2. Copy objects from Cloud Storage to VPS (Supabase CLI `storage` sync, or `rclone`/S3-compatible if exposed).
3. Old message URLs that hardcode `*.supabase.co` may still 404 until objects are copied or URLs rewritten.

## DNS / firewall

- Open VPS firewall for `80`, `443` (and only temporarily `8000` if testing without proxy).
- Do **not** expose Postgres `5432` to the public internet; keep it on localhost / private network.
- Point a subdomain e.g. `db.arhamtechnology.com` → VPS IP with SSL.

## What this does *not* do

- Does **not** convert the database to Hostinger panel MySQL.
- Does **not** remove the Supabase **open-source stack** (Auth/Realtime APIs). The CRM is built on that API. You stop paying / depending on **Supabase Cloud**.
- Does **not** auto-provision the VPS — owner must create it in hPanel.

## Rollback

1. Point env vars back to the Cloud project URL + keys.
2. Restart Node.
3. Keep the Cloud project paused/read-only until you are sure the VPS is stable, then cancel Cloud later.

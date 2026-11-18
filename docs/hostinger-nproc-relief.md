# Hostinger NPROC relief (process limit 120)

The plan hits **Max processes = 120** (hundreds of faults), not disk. Disk/inodes/CPU/RAM stay fine. Do these in hPanel on the **Advertising Business** plan.

## 1. Stop stuck processes (now)

1. hPanel → website `arhamadvertising.in` (or any site on this plan) → **Hosting Plan** → **Resources usage**
2. Click **Stop running processes**
3. Confirm
4. Open `whatsapp.arhamtechnology.com` → Node app → **Restart**

## 2. Cron schedule (keep NPROC low)

Advanced → **Cron Jobs** for `whatsapp.arhamtechnology.com`:

- Keep **one** Custom job only:

```bash
curl -fsS "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=YOUR_SECRET"
```

- Schedule: **`0 */2 * * *`** (every **2 hours** at minute 0)
- Delete any other job that hits `/api/cron/tick` or runs every minute

Do **not** set `ENABLE_IN_PROCESS_CRON=1` in Environment variables.

## 3. Prune old Node builds (`hbuilds`)

Failed/old deploys leave many files under `hbuilds` (~29k inodes for arhamtechnology.com builds).

1. hPanel → `whatsapp.arhamtechnology.com` → **Deployments**
2. Keep the current **Completed** deploy
3. If the UI offers delete/cleanup of old versions, remove failed older builds
4. Or **Files** / **SSH** → remove old folders under `hbuilds/versions` **except** the live one (if unsure, skip and only use Deployments UI)

## 4. Clear ffmpeg Node cache (~2.9 GB)

Only if you do not need a local ffmpeg binary for any site on this plan:

1. hPanel → **Files** (File Manager) for the hosting account
2. Open `.cache/ffmpeg-static-nodejs`
3. Delete its contents (or the folder)
4. Or SSH:

```bash
rm -rf ~/.cache/ffmpeg-static-nodejs
```

## 5. Other sites on the same plan

n8n, WordPress sites, and marketing sites share the **120 process** cap. After a spike:

- Pause unused Node/n8n apps
- Avoid running Hostinger **Redeploy** / `npm run build` while traffic is high (builds spawn many processes)

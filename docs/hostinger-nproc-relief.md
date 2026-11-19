# Hostinger NPROC relief (process limit 120) — permanent

## Root cause (why 98% keeps coming back)

The **Advertising Business** plan meters **all ~10 websites together**. The yellow
“Resources used in the last 24 hours” bar is a **rolling plan-wide** score —
not WhatsApp alone, and not “CPU right now.”

What actually trips the limit is **Max processes (NPROC = 120)**:

1. **WhatsApp Node** — each `/api/cron/tick` used to run **9 heavy jobs**
   (Shopify / Meta / Shiprocket / retention / visitors…). Even at 2h, one tick
   was still a long Meta/Shopify pass. Webhooks also fired immediate sends.
2. **Leftover dual cron URLs** — old hPanel jobs hitting `/api/shopify/cron`
   etc. **bypassed** the tick lock and multiplied work.
3. **Other sites on the same plan** — n8n, WordPress, PHP-FPM, marketing
   Node apps, Hostinger **Redeploy / npm run build**, old `hbuilds`, and
   `.cache/ffmpeg-static-nodejs` all share the same 120 process cap.

Code now defaults to a **Hostinger light profile** (see below). That alone
cannot clear the 24h chart if other sites or stuck processes still burn NPROC.

## What the app does now (after this fix)

| Control | Default on Hostinger |
| --- | --- |
| Cron profile | **light** — only `shopify` + `sequences` + `followups` |
| Batch sizes | abandoned **8**, drips **5**, send jobs **3**, followups **5** |
| Immediate webhook sends | max **1** job (or off via env) |
| Child cron URLs | **410 Gone** — use `/api/cron/tick` only |
| In-process timer | **off** unless `ENABLE_IN_PROCESS_CRON=1` |
| Kill switch | `DISABLE_ALL_CRON=1` → tick is a no-op |

Optional env (Hostinger → Environment variables):

```bash
# Emergency: stop all background cron work
DISABLE_ALL_CRON=1

# Also stop webhook after() Meta sends (queue only; tick drains later)
DISABLE_IMMEDIATE_WHATSAPP_SEND=1

# Restore full 9-job tick (only if NPROC has headroom)
# CRON_PROFILE=full

# Or pick jobs: CRON_JOBS=shopify,sequences,followups,automations
```

Do **not** set `ENABLE_IN_PROCESS_CRON=1` on this plan.

## Operator checklist (do in order)

### 1. Stop stuck processes (immediate relief)

1. hPanel → `arhamadvertising.in` → **Hosting Plan** → **Resources usage**
2. Click **Stop running processes** → Confirm
3. Open `whatsapp.arhamtechnology.com` → Node app → **Restart**
4. Optionally click **Boost resources** for temporary headroom

The 24h % bar only falls as overloaded hours age out (can take many hours).

### 2. One cron job only

Advanced → **Cron Jobs** for `whatsapp.arhamtechnology.com`:

- Keep **exactly one** Custom job:

```bash
curl -fsS "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=YOUR_SECRET"
```

- Schedule: **Once Per Hour** from Common settings, or **`0 */2 * * *`**
  (every 2 hours). Daily (`0 0 * * *`) is also fine for NPROC.
- **Delete** every other cron that hits this domain (`/api/shopify/cron`,
  `/api/automations/cron`, `/api/flows/cron`, every-minute curls, etc.)

### 3. Confirm light profile is live

After deploy of the permanent-relief PR:

1. Deployments → status **Completed**
2. Manually open (browser or curl) the tick URL once — JSON should show
   `"profile":"hostinger"` and heavy jobs with `"skipped":"profile"`
3. If load is still extreme, set `DISABLE_ALL_CRON=1`, restart Node, wait
   for the chart to cool, then remove the kill switch

### 4. Prune builds / caches

1. Deployments → delete failed/old builds under `hbuilds` if the UI allows
2. File Manager / SSH: `rm -rf ~/.cache/ffmpeg-static-nodejs` if unused

### 5. Other sites on the same plan (required for “permanent”)

NPROC is shared. After a spike:

- Pause unused **Node / n8n** apps
- Avoid **Redeploy** / `npm run build` during peak traffic
- Check WordPress / PHP cron plugins that spawn every minute
- If the plan stays near 100% with WhatsApp cron disabled
  (`DISABLE_ALL_CRON=1`), the pressure is **other sites** — upgrade the
  plan or move WhatsApp Node off shared hosting

## Related

- [`hostinger-cron.md`](./hostinger-cron.md) — curl / secret setup
- App code: `src/lib/cron/hostinger-profile.ts`, `src/lib/cron/tick.ts`

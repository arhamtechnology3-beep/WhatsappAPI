# Always-on automations (Hostinger)

Delayed WhatsApp jobs (abandoned cart, drip steps, wait steps, flow timeouts) do **not** run on your laptop. They run on the Hostinger Node process at `https://whatsapp.arhamtechnology.com`. Your PC can be off.

They only looked like they needed a login because live is **not Vercel**. `vercel.json` cron never fires on Hostinger, so jobs sat until someone opened the dashboard (which woke a sleeping Node process).

## 1. Keep Node running 24/7

In hPanel, the Node.js app for this site must stay **started**. If the process is stopped, nothing sends.

Set these env vars on Hostinger (same value is fine for the secrets):

```
AUTOMATION_CRON_SECRET=<long random string>
CRON_SECRET=<same string>
```

Do **not** set `ENABLE_IN_PROCESS_CRON` on shared hosting unless you intentionally want a second timer inside Node. Default is off — the hPanel curl below is enough.

Restart the Node app after changing env.

## 2. Add an hPanel cron (required)

Without an hPanel cron, delayed jobs only run when something else wakes Node (often a dashboard visit).

Command (prefer header; Hostinger wget can use the query instead):

```bash
curl -fsS -H "x-cron-secret: YOUR_SECRET" https://whatsapp.arhamtechnology.com/api/cron/tick
```

If the panel cannot set headers:

```bash
curl -fsS "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=YOUR_SECRET"
```

Schedule: every **1–2 hours** (`0 * * * *` or `0 */2 * * *`). The plan’s **Max processes (NPROC) = 120** is shared by all 10 sites; every-minute ticks cause process faults and 503/504.

**Delete any other cron** that hits this site (`/api/shopify/cron`, `/api/automations/cron`, etc.). Those child URLs now return **410** on Hostinger.

Overlapping ticks are single-flight locked (`already_running` JSON). Default **Hostinger light profile** only runs `shopify` + `sequences` + `followups` with tiny batches; heavy jobs stay skipped unless `CRON_PROFILE=full`.

A 200 JSON body with `"ok": true` and `"profile":"hostinger"` means the light workers ran (or a concurrent tick was safely skipped).

See also: [`hostinger-nproc-relief.md`](./hostinger-nproc-relief.md).

## 3. Shopify webhooks must hit production

Order / cart / customer events must POST to:

`https://whatsapp.arhamtechnology.com/api/webhooks/shopify/...`

not localhost or ngrok. Immediate templates (order confirmed) send when Shopify reaches that URL. Delayed templates still need the cron tick above.

## 4. Immediate vs delayed

| Event | Needs you logged in? | Needs cron? |
| --- | --- | --- |
| Order confirmed / shipped (webhook) | No | No (Hostinger Node must be up) |
| Cart abandoned after 30 min | No | Yes (may wait until next 2h tick) |
| Cart / browse drip steps | No | Yes |
| Automation wait steps | No | Yes |

## 5. If Max processes (NPROC) hits 120

1. **Stop running processes** + restart WhatsApp Node.
2. Confirm **one** cron only (`/api/cron/tick`) and `ENABLE_IN_PROCESS_CRON` is unset.
3. Optional emergency: set `DISABLE_ALL_CRON=1`, restart, wait for the 24h bar to cool.
4. Prune old `hbuilds` / clear `.cache/ffmpeg-static-nodejs` — see [`hostinger-nproc-relief.md`](./hostinger-nproc-relief.md).
5. Pause unused apps on the same plan (n8n, idle Node sites). The meter is **plan-wide**.

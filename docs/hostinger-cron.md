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

Do **not** set `ENABLE_IN_PROCESS_CRON` on shared hosting unless you intentionally want a second timer inside Node. Default is off — the hourly hPanel curl below is enough.

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

Schedule: **once per hour** (`0 * * * *`). Do **not** use every-minute or every-5-minute schedules — those push Business plan resources to 100% and cause 503/504.

Overlapping ticks are single-flight locked (`already_running` JSON). Heavy jobs (visitor recovery, retention, inquiry enroll, Shiprocket, template status) are throttled inside the tick.

A 200 JSON body with `"ok": true` means workers ran (or a concurrent tick was safely skipped).

## 3. Shopify webhooks must hit production

Order / cart / customer events must POST to:

`https://whatsapp.arhamtechnology.com/api/webhooks/shopify/...`

not localhost or ngrok. Immediate templates (order confirmed) send when Shopify reaches that URL. Delayed templates still need the cron tick above.

## 4. Immediate vs delayed

| Event | Needs you logged in? | Needs cron? |
| --- | --- | --- |
| Order confirmed / shipped (webhook) | No | No (Hostinger Node must be up) |
| Cart abandoned after 30 min | No | Yes (may wait until next hourly tick) |
| Cart / browse drip steps | No | Yes |
| Automation wait steps | No | Yes |

## 5. If plan resources stay near 100%

1. Remember the hPanel “last 24 hours” bar stays high until the overloaded hours roll off — it is not instantaneous.
2. Confirm hPanel cron is **hourly** (`0 * * * *`) and only one job hits `/api/cron/tick`.
3. Confirm `ENABLE_IN_PROCESS_CRON` is **unset**.
4. Use **Boost resources** and **Stop running processes**, then restart the WhatsApp Node app.
5. Other sites on the same plan (n8n, marketing sites, etc.) also share the 100% budget.

# Always-on automations (Hostinger)

Delayed WhatsApp jobs (abandoned cart, drip steps, wait steps, flow timeouts) do **not** run on your laptop. They run on the Hostinger Node process at `https://whatsapp.arhamtechnology.com`. Your PC can be off.

They only looked like they needed a login because live is **not Vercel**. `vercel.json` cron never fires on Hostinger, so jobs sat until someone opened the dashboard (which woke a sleeping Node process).

## 1. Keep Node running 24/7

In hPanel, the Node.js app for this site must stay **started**. If the process is stopped, nothing sends.

Set these env vars on Hostinger (same value is fine for the secrets):

```
AUTOMATION_CRON_SECRET=<long random string>
CRON_SECRET=<same string>
CRON_INTERVAL_MS=5400000
```

`CRON_INTERVAL_MS` is the in-process ticker cadence (milliseconds). Default is **5400000 (90 minutes)**. Do not set it below 60000. Use `3600000` for a 60-minute cadence if you prefer.

Optional: if you rely only on the hPanel curl below and want zero in-process timer, set `DISABLE_IN_PROCESS_CRON=1`.

Restart the Node app after changing env.

## 2. Add an hPanel cron (recommended)

The in-process timer only runs while Node is awake. An hPanel cron wakes it and drains due jobs even after idle sleep.

Command (prefer header; Hostinger wget can use the query instead):

```bash
curl -fsS -H "x-cron-secret: YOUR_SECRET" https://whatsapp.arhamtechnology.com/api/cron/tick
```

If the panel cannot set headers:

```bash
curl -fsS "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=YOUR_SECRET"
```

Schedule: **once per hour** (`0 * * * *`). Do **not** use every-minute or every-5-minute schedules — those stack with the in-process ticker on Business shared hosting and cause 503/504. (Standard cron cannot express exactly 90 minutes; hourly is the safe panel match. In-process default is 90 minutes.)

Overlapping ticks are single-flight locked (`already_running` JSON) so a slow Meta/Shopify pass cannot pile a second full run. Heavy jobs (visitor recovery, retention, inquiry enroll, Shiprocket, template status) are throttled inside the tick.

A 200 JSON body with `"ok": true` means workers ran (or a concurrent tick was safely skipped).

## 3. Shopify webhooks must hit production

Order / cart / customer events must POST to:

`https://whatsapp.arhamtechnology.com/api/webhooks/shopify/...`

not localhost or ngrok. Immediate templates (order confirmed) send when Shopify reaches that URL. Delayed templates still need the cron tick above.

## 4. Immediate vs delayed

| Event | Needs you logged in? | Needs cron? |
| --- | --- | --- |
| Order confirmed / shipped (webhook) | No | No (Hostinger Node must be up) |
| Cart abandoned after 30 min | No | Yes (may wait until next hourly/90-min tick) |
| Cart / browse drip steps | No | Yes |
| Automation wait steps | No | Yes |

## 5. If plan resources stay near 100%

1. Confirm hPanel cron is **hourly** (`0 * * * *`) — never every minute / every 5 minutes.
2. Confirm `CRON_INTERVAL_MS` is unset (90 min default) or `5400000` / `3600000`.
3. Prefer one wake path: set `DISABLE_IN_PROCESS_CRON=1` and rely on the hourly hPanel curl alone.
4. Use **Boost resources** in hPanel only as a temporary bridge while the deploy rolls out.

# Always-on automations (Hostinger)

Delayed WhatsApp jobs (abandoned cart, drip steps, wait steps, flow timeouts) do **not** run on your laptop. They run on the Hostinger Node process at `https://whatsapp.arhamtechnology.com`. Your PC can be off.

They only looked like they needed a login because live is **not Vercel**. `vercel.json` cron never fires on Hostinger, so jobs sat until someone opened the dashboard (which woke a sleeping Node process).

## 1. Keep Node running 24/7

In hPanel, the Node.js app for this site must stay **started**. If the process is stopped, nothing sends.

Set these env vars on Hostinger (same value is fine):

```
AUTOMATION_CRON_SECRET=<long random string>
CRON_SECRET=<same string>
```

Restart the Node app after changing env.

## 2. Add an hPanel cron (recommended)

The in-process timer only runs while Node is awake. A 1-minute cron wakes it and drains due jobs even after idle sleep.

Command (prefer header; Hostinger wget can use the query instead):

```bash
curl -fsS -H "x-cron-secret: YOUR_SECRET" https://whatsapp.arhamtechnology.com/api/cron/tick
```

If the panel cannot set headers:

```bash
curl -fsS "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=YOUR_SECRET"
```

Schedule: every minute (`* * * * *`).

A 200 JSON body with `"ok": true` means all four workers ran.

## 3. Shopify webhooks must hit production

Order / cart / customer events must POST to:

`https://whatsapp.arhamtechnology.com/api/webhooks/shopify/...`

not localhost or ngrok. Immediate templates (order confirmed) send when Shopify reaches that URL. Delayed templates still need the cron tick above.

## 4. Immediate vs delayed

| Event | Needs you logged in? | Needs cron? |
| --- | --- | --- |
| Order confirmed / shipped (webhook) | No | No (Hostinger Node must be up) |
| Cart abandoned after 30 min | No | Yes |
| Cart / browse drip steps | No | Yes |
| Automation wait steps | No | Yes |

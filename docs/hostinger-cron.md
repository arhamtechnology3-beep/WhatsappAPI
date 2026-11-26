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
curl -fsSL -H "x-cron-secret: YOUR_SECRET" https://whatsapp.arhamtechnology.com/api/cron/tick
```

If the panel cannot set headers:

```bash
curl -fsSL "https://whatsapp.arhamtechnology.com/api/cron/tick?secret=YOUR_SECRET"
```

Use **`-L`** so nginx `307` redirects are followed (without it the body is HTML and jobs never run).

Schedule (pick one):

- **Recommended under NPROC pressure:** every **2 hours** — `0 */2 * * *`
- **Once per day:** run inside IST send hours, e.g. **`0 4 * * *`** (09:30 IST).  
  Do **not** use `0 0 * * *` (00:00 UTC = 05:30 IST): inquiry/welcome drips used to defer to 09:30 and then never send until the next midnight.

The plan’s **Max processes (NPROC) = 120** is shared by all 10 sites; every-minute / hourly ticks under load cause process faults and 503/504.

Overlapping ticks are single-flight locked (`already_running` JSON + `lockAgeMs`). Heavy jobs (visitor recovery, retention, inquiry enroll, Shiprocket, template status) are throttled inside the tick; send/enroll batches are small.

If every manual tick returns `skipped: "already_running"` for several minutes, a prior tick is hung: **Restart the Node.js app** in hPanel (clears the in-memory lock), then curl again. After deploy, locks older than **8 minutes** are stolen automatically so a stuck job cannot block follow-ups forever.

### Force inquiry follow-up for specific chats

Expired quiet leads the scan used to miss (oldest-first scan now catches them). To enroll + send immediately for named phones:

```bash
curl -fsSL "https://whatsapp.arhamtechnology.com/api/cron/inquiry-enroll?secret=YOUR_SECRET&phones=918879554842"
```

Expect `enroll.results[].ok: true` and `sequences.body.messagesSent` ≥ 1 when templates are approved.

### Website DP10 / unlock follow-ups

Claims from the site popup (`Hi! Send my DP10 code (ref …)`) enroll into a 3-step drip until purchase. Backfill + send:

```bash
curl -fsSL "https://whatsapp.arhamtechnology.com/api/cron/offer-unlock-enroll?secret=YOUR_SECRET"
```

One phone (e.g. Swapna):

```bash
curl -fsSL "https://whatsapp.arhamtechnology.com/api/cron/offer-unlock-enroll?secret=YOUR_SECRET&phones=919059227738"
```

A 200 JSON body with `"ok": true` and **no** `skipped` means workers ran. `skipped: "already_running"` means another tick still held the lock (safe skip).

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
2. Confirm cron is `0 */2 * * *` and `ENABLE_IN_PROCESS_CRON` is unset.
3. Prune old `hbuilds` / clear `.cache/ffmpeg-static-nodejs` — see [`hostinger-nproc-relief.md`](./hostinger-nproc-relief.md).
4. Pause unused apps on the same plan (n8n, idle Node sites).

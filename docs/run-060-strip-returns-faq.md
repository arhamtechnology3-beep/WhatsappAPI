# Run now: strip Returns & Refund from Choose Category

Supabase SQL Editor → paste and run:

`supabase/migrations/060_strip_returns_from_faq_menu.sql`

After Hostinger deploys the matching app commit, Returns/Refund is also stripped at runtime even if SQL is delayed.

## Talk to Agent hours (already in app)

- Menu still shows **Talk to Agent** (by design).
- **Mon–Sat 9 AM–7 PM IST:** tap → Chat with Agent button.
- **Outside those hours / Sunday:** tap → “Our team is available Monday to Saturday, 9 AM - 7 PM…” — **no** Chat button.

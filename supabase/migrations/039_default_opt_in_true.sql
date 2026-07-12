-- ============================================================
-- 039_default_opt_in_true.sql
--
-- Sets default opt-in status to true for both new and existing
-- contacts (unless they have explicitly opted out).
-- ============================================================

-- 1) Set default values to true
ALTER TABLE contacts ALTER COLUMN marketing_opt_in SET DEFAULT true;
ALTER TABLE contacts ALTER COLUMN whatsapp_marketing_opt_in SET DEFAULT true;

-- 2) Update existing contacts that have not explicitly opted out to be opted in
UPDATE contacts 
SET marketing_opt_in = true, 
    whatsapp_marketing_opt_in = true,
    marketing_opt_in_source = COALESCE(marketing_opt_in_source, 'manual'),
    marketing_opt_in_at = COALESCE(marketing_opt_in_at, NOW())
WHERE marketing_opt_out_at IS NULL;

-- ============================================================
-- 045_contact_email_unique.sql
--
-- Same person must be one contact: unique phone (already in 022) AND
-- unique email per account. Shopify checkouts often arrive with email
-- and a blank phone, which bypassed the phone unique index and created
-- a new row on every sync (e.g. 13 copies of jesalp85@gmail.com).
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_normalized TEXT
  GENERATED ALWAYS AS (lower(trim(COALESCE(email, '')))) STORED;

CREATE OR REPLACE FUNCTION public.merge_contact_children(
  v_survivor UUID,
  v_losers UUID[]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

  BEGIN
    UPDATE shopify_checkouts SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE shopify_orders    SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE shopify_recovery_tracking SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE opt_in_events SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE whatsapp_send_jobs SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  UPDATE contact_tags ct SET contact_id = v_survivor
    WHERE ct.contact_id = ANY(v_losers)
      AND NOT EXISTS (
        SELECT 1 FROM contact_tags s
        WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id
      );
  DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);

  UPDATE contact_custom_values cv SET contact_id = v_survivor
    WHERE cv.contact_id = ANY(v_losers)
      AND NOT EXISTS (
        SELECT 1 FROM contact_custom_values s
        WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id
      );
  DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);

  UPDATE flow_runs SET contact_id = v_survivor
    WHERE contact_id = ANY(v_losers) AND status <> 'active';

  BEGIN
    IF EXISTS (SELECT 1 FROM conversation_sources WHERE contact_id = v_survivor) THEN
      DELETE FROM conversation_sources WHERE contact_id = ANY(v_losers);
    ELSE
      UPDATE conversation_sources SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group    RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_merged   INTEGER := 0;
BEGIN
  -- Phone duplicates (non-empty)
  FOR v_group IN
    SELECT account_id,
           phone_normalized,
           (array_agg(id ORDER BY
             CASE WHEN phone_normalized <> '' THEN 0 ELSE 1 END,
             CASE WHEN shopify_customer_id IS NOT NULL AND shopify_customer_id <> '' THEN 0 ELSE 1 END,
             created_at ASC, id ASC
           )) AS ids
    FROM contacts
    WHERE phone_normalized <> ''
    GROUP BY account_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];
    PERFORM public.merge_contact_children(v_survivor, v_losers);
    DELETE FROM contacts WHERE id = ANY(v_losers);
    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  -- Email duplicates (case-insensitive, non-empty)
  FOR v_group IN
    SELECT account_id,
           email_normalized,
           (array_agg(id ORDER BY
             CASE WHEN phone_normalized <> '' THEN 0 ELSE 1 END,
             CASE WHEN shopify_customer_id IS NOT NULL AND shopify_customer_id <> '' THEN 0 ELSE 1 END,
             created_at ASC, id ASC
           )) AS ids
    FROM contacts
    WHERE email_normalized <> ''
    GROUP BY account_id, email_normalized
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    UPDATE contacts AS s SET
      phone = COALESCE(NULLIF(s.phone, ''), (
        SELECT c.phone FROM contacts c WHERE c.id = ANY(v_losers) AND regexp_replace(c.phone, '\D', '', 'g') <> '' LIMIT 1
      )),
      shopify_customer_id = COALESCE(NULLIF(s.shopify_customer_id, ''), (
        SELECT c.shopify_customer_id FROM contacts c WHERE c.id = ANY(v_losers) AND c.shopify_customer_id IS NOT NULL LIMIT 1
      )),
      company = COALESCE(NULLIF(s.company, ''), (
        SELECT c.company FROM contacts c WHERE c.id = ANY(v_losers) AND c.company IS NOT NULL AND c.company <> '' LIMIT 1
      )),
      email = lower(trim(s.email)),
      updated_at = NOW()
    WHERE s.id = v_survivor;

    PERFORM public.merge_contact_children(v_survivor, v_losers);
    DELETE FROM contacts WHERE id = ANY(v_losers);
    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_contact_children(UUID, UUID[]) OWNER TO postgres;
ALTER FUNCTION public.merge_duplicate_contacts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_contact_children(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts() TO authenticated;

SELECT public.merge_duplicate_contacts();

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_email_normalized
  ON contacts (account_id, email_normalized)
  WHERE email_normalized <> '';

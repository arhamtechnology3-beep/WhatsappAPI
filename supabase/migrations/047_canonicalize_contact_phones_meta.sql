-- Canonicalize contacts.phone to Meta Cloud API format:
-- digits only, country code included, no + or spaces.
-- India: "+91 98203 68269" / "9820368269" → "919820368269"
--
-- 1) SQL equivalent of toMetaPhone()
-- 2) Merge rows that become the same number after canonicalization
--    (e.g. 9820368269 vs 919820368269) using the same child re-point
--    as merge_duplicate_contacts()
-- 3) Rewrite remaining phones in place

CREATE OR REPLACE FUNCTION public.to_meta_phone(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
  cc TEXT := '91';
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN '';
  END IF;
  digits := regexp_replace(raw, '\D', '', 'g');
  IF digits = '' THEN
    RETURN '';
  END IF;
  IF left(digits, 2) = '00' THEN
    digits := substr(digits, 3);
  END IF;

  -- 91 + 0 + 10-digit mobile
  IF digits LIKE cc || '0%'
     AND length(digits) = length(cc) + 11
     AND substr(digits, length(cc) + 2, 1) ~ '[6-9]' THEN
    RETURN cc || substr(digits, length(cc) + 2);
  END IF;

  -- already 91 + 10-digit mobile
  IF digits LIKE cc || '%'
     AND length(digits) = length(cc) + 10
     AND substr(digits, length(cc) + 1, 1) ~ '[6-9]' THEN
    RETURN digits;
  END IF;

  -- trunk 0 + 10-digit Indian mobile
  IF length(digits) = 11
     AND left(digits, 1) = '0'
     AND substr(digits, 2, 1) ~ '[6-9]' THEN
    RETURN cc || substr(digits, 2);
  END IF;

  -- bare 10-digit Indian mobile
  IF length(digits) = 10 AND left(digits, 1) ~ '[6-9]' THEN
    RETURN cc || digits;
  END IF;

  RETURN digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonicalize_contact_phones()
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
  v_updated  INTEGER := 0;
BEGIN
  -- Merge contacts that share a canonical Meta phone (across formats).
  FOR v_group IN
    SELECT account_id,
           public.to_meta_phone(phone) AS canonical,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM contacts
    WHERE public.to_meta_phone(phone) <> ''
    GROUP BY account_id, public.to_meta_phone(phone)
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    UPDATE conversations                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE shopify_checkouts             SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE shopify_orders                SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE shopify_recovery_tracking     SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE whatsapp_send_jobs            SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE opt_in_events                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

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

    DELETE FROM contacts WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  UPDATE contacts
  SET phone = public.to_meta_phone(phone),
      updated_at = now()
  WHERE public.to_meta_phone(phone) <> ''
    AND phone IS DISTINCT FROM public.to_meta_phone(phone);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_merged + v_updated;
END;
$$;

ALTER FUNCTION public.to_meta_phone(TEXT) OWNER TO postgres;
ALTER FUNCTION public.canonicalize_contact_phones() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.canonicalize_contact_phones() FROM PUBLIC;

SELECT public.canonicalize_contact_phones();

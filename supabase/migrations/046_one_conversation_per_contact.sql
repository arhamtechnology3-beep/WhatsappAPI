-- ============================================================
-- 046_one_conversation_per_contact.sql
--
-- Inbox listed several threads for the same phone because:
--   1. contact merge (022/045) re-pointed conversations onto one
--      contact without collapsing those conversation rows;
--   2. Shopify automations INSERT a conversation when lookup fails,
--      and `.maybeSingle()` errors when more than one row already
--      exists — so each cart drip created another thread.
--
-- Merge extras onto the newest-active conversation, then UNIQUE
-- (account_id, contact_id). Also collapse after future contact merges.
-- ============================================================

CREATE OR REPLACE FUNCTION public.merge_duplicate_conversations()
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
  v_unread   INTEGER;
BEGIN
  FOR v_group IN
    SELECT account_id,
           contact_id,
           (array_agg(id ORDER BY last_message_at DESC NULLS LAST, created_at ASC, id ASC)) AS ids
    FROM conversations
    GROUP BY account_id, contact_id
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    SELECT COALESCE(SUM(unread_count), 0) INTO v_unread
    FROM conversations
    WHERE id = v_survivor OR id = ANY(v_losers);

    UPDATE messages SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);

    BEGIN
      UPDATE message_reactions SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    UPDATE deals SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);

    BEGIN
      UPDATE flow_runs SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM conversation_sources WHERE conversation_id = ANY(v_losers);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    UPDATE conversations c SET
      unread_count = v_unread,
      last_message_at = COALESCE((
        SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = v_survivor
      ), c.last_message_at),
      last_message_text = COALESCE((
        SELECT m.content_text FROM messages m
        WHERE m.conversation_id = v_survivor
        ORDER BY m.created_at DESC
        LIMIT 1
      ), c.last_message_text),
      updated_at = NOW()
    WHERE c.id = v_survivor;

    DELETE FROM conversations WHERE id = ANY(v_losers);
    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

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

  PERFORM public.merge_duplicate_conversations();
END;
$$;

ALTER FUNCTION public.merge_duplicate_conversations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_conversations() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_conversations() TO authenticated;

SELECT public.merge_duplicate_conversations();

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact
  ON conversations (account_id, contact_id);

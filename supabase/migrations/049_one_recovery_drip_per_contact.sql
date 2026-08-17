-- One in-progress recovery drip per contact + sequence.
-- Duplicate rows (checkout id vs token vs cart_token) caused the same
-- WhatsApp template, especially cart step 3, to send several times at once.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY contact_id, sequence_id
      ORDER BY created_at DESC
    ) AS rn
  FROM shopify_recovery_tracking
  WHERE status = 'in_progress'
)
UPDATE shopify_recovery_tracking t
SET status = 'stopped',
    updated_at = NOW()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_in_progress_recovery_per_contact_sequence
  ON shopify_recovery_tracking (contact_id, sequence_id)
  WHERE status = 'in_progress';

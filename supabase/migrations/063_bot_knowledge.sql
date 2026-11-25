-- ============================================================
-- 063_bot_knowledge.sql
--
-- Product Q&A knowledge base for inbound WhatsApp replies.
-- WhatsApp already sends the customer profile name — we do NOT ask
-- for name again. Product / catalog / delivery questions are answered
-- from this table (and unmatched questions are stored as pending so
-- agents can teach the bot).
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Short label for operators (e.g. "Mumbai delivery").
  title TEXT NOT NULL,
  -- Customer-facing answer the bot sends.
  answer TEXT NOT NULL,
  -- Lowercase keywords / phrases; match if any appears in inbound text.
  keywords TEXT[] NOT NULL DEFAULT '{}',
  -- Optional regex (case-insensitive) for richer matching.
  pattern TEXT,
  -- active = usable for auto-reply; pending = learned from chat, needs review;
  -- archived = keep history but do not match.
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'archived')),
  -- seed | chat_learn | agent | backfill
  source TEXT NOT NULL DEFAULT 'seed',
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ,
  example_question TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_knowledge_account_status
  ON bot_knowledge(account_id, status);

CREATE INDEX IF NOT EXISTS idx_bot_knowledge_keywords
  ON bot_knowledge USING GIN (keywords);

ALTER TABLE bot_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_knowledge_select ON bot_knowledge;
CREATE POLICY bot_knowledge_select ON bot_knowledge FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS bot_knowledge_insert ON bot_knowledge;
CREATE POLICY bot_knowledge_insert ON bot_knowledge FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS bot_knowledge_update ON bot_knowledge;
CREATE POLICY bot_knowledge_update ON bot_knowledge FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS bot_knowledge_delete ON bot_knowledge;
CREATE POLICY bot_knowledge_delete ON bot_knowledge FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON bot_knowledge;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bot_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed standard product / shipping answers for every account that
-- does not already have them (matched by title).
INSERT INTO bot_knowledge (account_id, title, answer, keywords, pattern, status, source, example_question)
SELECT
  a.id,
  v.title,
  v.answer,
  string_to_array(v.keywords, '|'),
  v.pattern,
  'active',
  'seed',
  v.example_question
FROM accounts a
CROSS JOIN (
  VALUES
    (
      'Full product catalog',
      E'Jai Shree Krishna 🙏\n\nYes — here is our complete product list (pickles and everything we make):\nhttps://divyaprabhafoods.com/collections/all-products\n\nHandmade by didis, no chemical preservatives. Reply with the items you want and your pincode — we will confirm price + delivery.',
      'product list|complete list|catalogue|catalog|all products|items|pickle|pickles|achar|achaar|buy|purchase|order|price list|menu|what do you sell|products which you make',
      '(product|item|pickle|achar|catalog|catalogue|list).{0,40}(list|send|share|complete|full)|(buy|purchase|order).{0,40}(pickle|product|achar)',
      'We like to purchase your pickles, please send your complete list of items'
    ),
    (
      'Mumbai / India home delivery',
      E'Yes — we deliver to Mumbai (and across India) at your residence.\n\n• Dispatch in 24–48 hours\n• Delivery usually 3–5 business days (area dependent)\n• Free shipping on 2×250g pickles, or orders above ₹599; otherwise delivery charges as applicable\n\nShare your Mumbai pincode and we will confirm exact delivery charges. Full payment + delivery is fine 🙏',
      'mumbai|delivery|deliver|ship|shipping|residence|home delivery|courier|send to|pahunch|bhej',
      '(mumbai|delhi|bangalore|bengaluru|pune|hyderabad|chennai|kolkata|india).{0,30}(deliver|ship|send)|(deliver|ship|send).{0,40}(mumbai|residence|home|address)',
      'will you be able to send to mumbai at our residence'
    ),
    (
      'Payment + delivery charges',
      E'Yes — you can pay full payment online, and delivery charges as applicable for your pincode.\n\nOffers:\n✅ Buy 2×250g pickles — FREE shipping\n✅ FREE shipping above ₹599\n\nShop: https://divyaprabhafoods.com/collections/all-products\n\nReply with your pincode + items and we will confirm the total.',
      'payment|pay full|full payment|delivery charges|cod|prepaid|online payment',
      '(full\s*payment|pay|payment|delivery\s*charges|cod)',
      'We will pay full payment + full delivery charges whatever applicable'
    ),
    (
      'Shipping info',
      E'We ship orders within 24–48 hours. Delivery takes about 3–5 business days depending on your location.\n\nFree shipping on 2×250g pickles or orders above ₹599.\nCatalog: https://divyaprabhafoods.com/collections/all-products',
      'shipping info|shipping|delivery time|kitne din|when will it arrive',
      'shipping|delivery\s*time|kitne\s*din',
      'Shipping Info'
    )
) AS v(title, answer, keywords, pattern, example_question)
WHERE NOT EXISTS (
  SELECT 1 FROM bot_knowledge k
  WHERE k.account_id = a.id AND k.title = v.title
);

-- Pause first-inbound lead-capture flows that still ask for name —
-- WhatsApp already provides the profile name on every inbound.
UPDATE flows f
SET status = 'draft', updated_at = NOW()
WHERE f.trigger_type = 'first_inbound_message'
  AND f.status = 'active'
  AND EXISTS (
    SELECT 1 FROM flow_nodes n
    WHERE n.flow_id = f.id
      AND n.node_type = 'collect_input'
      AND lower(coalesce(n.config->>'var_key', '')) = 'name'
  );

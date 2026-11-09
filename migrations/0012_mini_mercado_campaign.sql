-- Official complimentary Mini Mercado letter, separate from real Pix accounting.
ALTER TABLE orders ADD COLUMN campaign_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_campaign_recipient_unique
  ON orders(campaign_key,recipient_id) WHERE campaign_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ejc_campaigns (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  composition_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manually acknowledged WhatsApp delivery. Opening wa.me is not a send receipt.
CREATE TABLE IF NOT EXISTS recipient_whatsapp_deliveries (
  recipient_id TEXT NOT NULL REFERENCES recipients(id),
  campaign_key TEXT NOT NULL CHECK(campaign_key IN ('mural','pos-encontro')),
  sent_at TEXT NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 1,
  image_sent INTEGER NOT NULL DEFAULT 0 CHECK(image_sent IN (0,1)),
  PRIMARY KEY(recipient_id,campaign_key)
);

-- Append-only manual delivery audit. Templates retain placeholders, never
-- personalized URLs, recipient grants or secret tokens.
CREATE TABLE IF NOT EXISTS recipient_whatsapp_delivery_history (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES recipients(id),
  campaign_key TEXT NOT NULL CHECK(campaign_key IN ('mural','pos-encontro')),
  sent_at TEXT NOT NULL,
  sent_by TEXT NOT NULL DEFAULT 'admin',
  image_sent INTEGER NOT NULL DEFAULT 1,
  message_template TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS recipient_whatsapp_history_lookup
  ON recipient_whatsapp_delivery_history(recipient_id,campaign_key,sent_at DESC);

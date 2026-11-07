-- Read receipts and transactional notification outbox. No letter content or sender email in admin queries.
ALTER TABLE orders ADD COLUMN first_read_at TEXT;
CREATE TABLE IF NOT EXISTS order_read_receipts (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  email_encrypted TEXT NOT NULL,
  verify_hash TEXT UNIQUE,
  verify_expires_at TEXT NOT NULL,
  verified_at TEXT,
  first_read_at TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(order_id,event)
);
CREATE INDEX IF NOT EXISTS notification_outbox_queue ON notification_outbox(sent_at,next_attempt_at);

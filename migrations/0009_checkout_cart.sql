-- Um único Pix paga várias cartinhas, com token privado independente por destinatário.
CREATE TABLE IF NOT EXISTS checkouts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  txid TEXT NOT NULL UNIQUE,
  total_cents INTEGER NOT NULL CHECK(total_cents>0),
  pix_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','paid','cancelled')),
  bank_reference TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  confirmed_at TEXT
);
ALTER TABLE orders ADD COLUMN checkout_id TEXT REFERENCES checkouts(id);
ALTER TABLE orders ADD COLUMN checkout_item_index INTEGER;
CREATE INDEX IF NOT EXISTS orders_checkout_id ON orders(checkout_id,checkout_item_index);

PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS recipients_name ON recipients(name);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL DEFAULT '🎁',
  price_cents INTEGER NOT NULL CHECK(price_cents > 0), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, recipient_id TEXT NOT NULL REFERENCES recipients(id),
  sender_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','claimed','paid','preparing','delivered','cancelled')),
  total_cents INTEGER NOT NULL, pix_payload TEXT NOT NULL, txid TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL DEFAULT '', bank_reference TEXT UNIQUE,
  payment_claimed_at TEXT, confirmed_at TEXT, delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL, unit_price_cents INTEGER NOT NULL, quantity INTEGER NOT NULL,
  PRIMARY KEY(order_id, product_id)
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL CHECK(kind IN ('audio','image')),
  filename TEXT NOT NULL, content_type TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
  upload_id TEXT, status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready')),
  bytes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS media_order_id ON media(order_id);
CREATE TABLE IF NOT EXISTS media_parts (
  media_id TEXT NOT NULL REFERENCES media(id), part_number INTEGER NOT NULL,
  etag TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(media_id, part_number)
);
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id, created_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  fingerprint TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_rate (
  fingerprint TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
);
INSERT OR IGNORE INTO settings(key, value) VALUES
  ('pix_key',''), ('pix_name',''), ('pix_city','SIMONESIA'),
  ('deadline','2026-11-08T16:00'), ('open','true'),
  ('store_title','Mini Mercado • XX EJC'), ('store_subtitle','Um carinho para quem está vivendo esse encontro.');
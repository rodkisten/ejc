-- EJC Homenagens v2. Existing paid orders and media are retained.
ALTER TABLE recipients ADD COLUMN slug TEXT;
ALTER TABLE recipients ADD COLUMN mural_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS recipients_slug_unique ON recipients(slug);
ALTER TABLE orders ADD COLUMN rich_html TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN public_message INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN moderation TEXT NOT NULL DEFAULT 'draft' CHECK(moderation IN ('draft','pending','approved','rejected'));
ALTER TABLE orders ADD COLUMN moderation_note TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN submitted_at TEXT;
ALTER TABLE orders ADD COLUMN approved_at TEXT;
ALTER TABLE orders ADD COLUMN release_override INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO settings(key,value) VALUES
('message_price_cents','1000'),
('release_at','2026-11-08T17:00'),
('analytics_id',''),
('store_title','Cartinhas do XX EJC'),
('store_subtitle','Sua voz, suas fotos e suas palavras. Uma surpresa para guardar no coração.');
UPDATE settings SET value='Cartinhas do XX EJC' WHERE key='store_title' AND value LIKE 'Mini Mercado%';
UPDATE settings SET value='Envie uma cartinha com texto, fotos e áudio para um encontrista.' WHERE key='store_subtitle' AND value LIKE 'Um carinho%';
CREATE INDEX IF NOT EXISTS orders_moderation ON orders(moderation,approved_at);

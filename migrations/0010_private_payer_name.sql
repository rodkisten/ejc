-- Nome do comprador exclusivamente para conferência administrativa de Pix.
-- Não é a assinatura pública da cartinha, e nunca deve aparecer no mural.
ALTER TABLE checkouts ADD COLUMN payer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN payer_name TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS checkouts_payer_name ON checkouts(payer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS orders_payer_name ON orders(payer_name COLLATE NOCASE);

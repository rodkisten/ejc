-- Private, structured presentation metadata. Never exposed by administrative endpoints.
ALTER TABLE orders ADD COLUMN composition_json TEXT NOT NULL DEFAULT '{}';

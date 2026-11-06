-- Profile photos are public only after recorded image authorization.
ALTER TABLE recipients ADD COLUMN photo_key TEXT;
ALTER TABLE recipients ADD COLUMN photo_consent INTEGER NOT NULL DEFAULT 0;

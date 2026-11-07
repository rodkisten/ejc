-- Six-character printed invitation codes. Not exposed in the public recipient list.
ALTER TABLE recipients ADD COLUMN mural_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS recipients_mural_code_idx ON recipients(mural_code);
CREATE TABLE IF NOT EXISTS mural_code_attempts (
  fingerprint TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

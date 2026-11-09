-- Short, unguessable first-party links. Never store cleartext sender data,
-- payment references, mural grants, access tokens or UTM parameters.
-- destination_ciphertext is AES-256-GCM encrypted with SESSION_SECRET.
CREATE TABLE IF NOT EXISTS short_links (
  code TEXT PRIMARY KEY NOT NULL
    CHECK (length(code) = 14),
  destination_ciphertext TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS short_links_expires_at
  ON short_links(expires_at);

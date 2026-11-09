-- Operational recovery state only. Never copy a letter body or private access token here.
CREATE TABLE IF NOT EXISTS draft_recovery (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  empty_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  recovered_at TEXT,
  recipient_notified_at TEXT
);
CREATE INDEX IF NOT EXISTS draft_recovery_recovered_idx ON draft_recovery(recovered_at);

-- Include currently paid empty drafts, without inspecting or exposing their text.
INSERT OR IGNORE INTO draft_recovery(order_id,empty_seen_at)
SELECT o.id,datetime('now') FROM orders o
WHERE o.status IN ('paid','preparing','delivered')
  AND o.submitted_at IS NULL AND o.campaign_key IS NULL
  AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(o.rich_html,''),'<p>',''),'</p>',''),'<br>',''),'&nbsp;',''))=''
  AND NOT EXISTS(SELECT 1 FROM media m WHERE m.order_id=o.id AND m.status='ready');

-- Anonymous daily aggregate for short-help-link openings, never IP, names or tokens.
CREATE TABLE IF NOT EXISTS help_link_counts (
  day TEXT NOT NULL,
  campaign TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,campaign)
);

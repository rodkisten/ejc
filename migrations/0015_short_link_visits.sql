-- Count human short-link openings without collecting personal data.
-- Existing links remain valid; this table only adds analytics.
CREATE TABLE IF NOT EXISTS short_link_visits (
  code TEXT NOT NULL REFERENCES short_links(code) ON DELETE CASCADE,
  day TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  last_visited_at INTEGER NOT NULL,
  PRIMARY KEY (code, day)
);
CREATE INDEX IF NOT EXISTS short_link_visits_day ON short_link_visits(day);

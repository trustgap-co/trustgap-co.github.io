-- Photos the buyer attaches when reporting a problem (up to 2). Private evidence: only TrustGap staff
-- and the buyer can open them, through signed links that expire.
CREATE TABLE IF NOT EXISTS dispute_photos (
  id INTEGER PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id),
  position INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (dispute_id, position)
);

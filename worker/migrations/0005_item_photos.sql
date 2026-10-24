-- Photos of the item, added by the seller with the link. The buyer sees them before paying, their
-- fingerprints are part of the terms the buyer accepts, and they stay with the order as evidence.
CREATE TABLE IF NOT EXISTS deal_photos (
  id INTEGER PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  position INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, position)
);
ALTER TABLE deals ADD COLUMN photo_count INTEGER NOT NULL DEFAULT 0;
